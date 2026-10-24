import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { app } from "electron";

/**
 * Pulls icons straight out of the Windows shell.
 *
 * `IShellItemImageFactory` renders whatever Explorer and the Start menu show
 * for a shell item, which means it works for every entry in AppsFolder,
 * packaged or not, with or without a .lnk on disk. That's the whole point: the
 * older routes needed either a file path (extract-file-icon) or an AppxManifest
 * (packaged apps), and a large slice of Get-StartApps results have neither.
 *
 * The interop is JIT-compiled by PowerShell once per invocation, so every
 * pending icon is done in a single batched process rather than one each.
 */
const PS_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class VoltShellIcon
{
    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory
    {
        void GetImage([In, MarshalAs(UnmanagedType.Struct)] SIZE size, [In] int flags, out IntPtr phbm);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct SIZE { public int cx; public int cy; public SIZE(int x, int y) { cx = x; cy = y; } }

    [StructLayout(LayoutKind.Sequential)]
    struct BITMAP
    {
        public int bmType; public int bmWidth; public int bmHeight;
        public int bmWidthBytes; public ushort bmPlanes; public ushort bmBitsPixel;
        public IntPtr bmBits;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath, IntPtr pbc,
        [In] ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);

    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr hObject);
    [DllImport("gdi32.dll")] static extern int GetObject(IntPtr hObject, int nCount, ref BITMAP lpObject);

    // Bitmap.FromHbitmap throws the alpha channel away, which turns every
    // transparent pixel opaque black. GetImage hands back a 32bpp premultiplied
    // ARGB DIB, so the bits are wrapped directly and drawn into a straight ARGB
    // surface instead.
    static Bitmap FromHbitmapWithAlpha(IntPtr hbmp)
    {
        BITMAP bm = new BITMAP();
        if (GetObject(hbmp, Marshal.SizeOf(typeof(BITMAP)), ref bm) == 0
            || bm.bmBitsPixel != 32 || bm.bmBits == IntPtr.Zero)
        {
            return Bitmap.FromHbitmap(hbmp);
        }

        bool hasAlpha = false;
        int total = bm.bmWidth * bm.bmHeight;
        for (int i = 0; i < total; i++)
        {
            if (Marshal.ReadByte(bm.bmBits, i * 4 + 3) != 0) { hasAlpha = true; break; }
        }
        // An all-zero alpha channel means the source icon had none; treating it
        // as transparent would save a blank image.
        if (!hasAlpha) return Bitmap.FromHbitmap(hbmp);

        // The DIB is bottom-up: bmBits is the *last* visual row. Walking it with
        // a positive stride renders the icon upside down, so start at the final
        // row and step backwards.
        IntPtr firstRow = new IntPtr(bm.bmBits.ToInt64() + (long)(bm.bmHeight - 1) * bm.bmWidthBytes);
        using (Bitmap src = new Bitmap(bm.bmWidth, bm.bmHeight, -bm.bmWidthBytes,
                                       PixelFormat.Format32bppPArgb, firstRow))
        {
            Bitmap dst = new Bitmap(bm.bmWidth, bm.bmHeight, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(dst))
            {
                g.Clear(Color.Transparent);
                g.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
                g.DrawImage(src, 0, 0);
            }
            return dst;
        }
    }

    public static bool Save(string parsingName, int size, string outPath)
    {
        Guid iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
        IShellItemImageFactory factory;
        SHCreateItemFromParsingName(parsingName, IntPtr.Zero, ref iid, out factory);
        IntPtr hbmp = IntPtr.Zero;
        try
        {
            // SIIGBF_ICONONLY (0x004) so we get the app's icon rather than a
            // document thumbnail, plus SIIGBF_SCALEUP (0x100) so an app that
            // only ships a 16px icon still fills the canvas instead of sitting
            // tiny in the corner of it.
            factory.GetImage(new SIZE(size, size), 0x004 | 0x100, out hbmp);
            if (hbmp == IntPtr.Zero) return false;
            using (Bitmap bmp = FromHbitmapWithAlpha(hbmp))
            {
                bmp.Save(outPath, ImageFormat.Png);
            }
            return true;
        }
        finally
        {
            if (hbmp != IntPtr.Zero) DeleteObject(hbmp);
            if (factory != null) Marshal.ReleaseComObject(factory);
        }
    }
}
"@ -ReferencedAssemblies System.Drawing, System.Runtime.InteropServices

# The job is UTF-8 JSON; the console's default code page would mangle any
# non-ASCII app name or path on the way in.
[Console]::InputEncoding = [Text.Encoding]::UTF8
$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
$job = $raw | ConvertFrom-Json
# One line per entry as it finishes ("<index> 1|0"), so the caller can show
# real progress, and only ASCII crosses the pipe.
$i = 0
foreach ($item in $job.entries) {
    $ok = 0
    try {
        if ([VoltShellIcon]::Save($item.parsingName, $job.size, $item.outPath)) { $ok = 1 }
    } catch { }
    [Console]::Out.WriteLine("$i $ok")
    [Console]::Out.Flush()
    $i++
}
`;

let scriptPath = null;

function ensureScript() {
    if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
    const dir = path.join(app.getPath("userData"), "scripts");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, "shellIcon.ps1");
    fs.writeFileSync(target, PS_SCRIPT, "utf8");
    scriptPath = target;
    return target;
}

/**
 * @param entries [{ key, parsingName, outPath }]
 * @param onEntry called as each entry finishes: (entry, ok)
 * @returns Set of keys that were written successfully. Entries finished
 *          before a timeout or crash still count.
 */
export function extractShellIcons(entries, { size = 256, timeoutMs = 120000, onEntry } = {}) {
    return new Promise((resolve) => {
        const written = new Set();
        if (!entries?.length) return resolve(written);

        let script;
        try {
            script = ensureScript();
        } catch (err) {
            console.warn("shellIcon: could not stage script:", err?.message);
            return resolve(written);
        }

        let pending = "";
        const handleLine = (line) => {
            const match = /^(\d+) ([01])$/.exec(line.trim());
            const entry = match && entries[Number(match[1])];
            if (!entry) return;
            const ok = match[2] === "1";
            if (ok) written.add(entry.key);
            try { onEntry?.(entry, ok); } catch { /* a progress hook must not end the run */ }
        };

        const child = execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
            { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
            (err) => {
                if (pending) handleLine(pending);
                if (err) console.warn("shellIcon: extraction failed:", err?.message);
                resolve(written);
            }
        );
        child.stdout.on("data", (chunk) => {
            const lines = (pending + chunk).split(/\r?\n/);
            pending = lines.pop();
            lines.forEach(handleLine);
        });

        child.on("error", () => resolve(written));
        try {
            child.stdin.end(JSON.stringify({ size, entries }), "utf8");
        } catch {
            resolve(written);
        }
    });
}
