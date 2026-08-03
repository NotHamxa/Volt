import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { app } from "electron";

/**
 * Pulls icons straight out of the Windows shell.
 *
 * `IShellItemImageFactory` renders whatever Explorer and the Start menu show
 * for a shell item, which means it works for every entry in AppsFolder —
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
            // SIIGBF_BIGGERSIZEOK: accept a larger source rather than upscaling.
            factory.GetImage(new SIZE(size, size), 0x04, out hbmp);
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

$raw = [Console]::In.ReadToEnd()
if (-not $raw) { "[]"; exit 0 }
$job = $raw | ConvertFrom-Json
$results = @()
foreach ($item in $job.entries) {
    try {
        if ([VoltShellIcon]::Save($item.parsingName, $job.size, $item.outPath)) {
            $results += [pscustomobject]@{ key = $item.key; ok = $true }
        } else {
            $results += [pscustomobject]@{ key = $item.key; ok = $false }
        }
    } catch {
        $results += [pscustomobject]@{ key = $item.key; ok = $false }
    }
}
ConvertTo-Json -InputObject @($results) -Compress
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
 * @returns Set of keys that were written successfully
 */
export function extractShellIcons(entries, size = 256, timeoutMs = 120000) {
    return new Promise((resolve) => {
        if (!entries?.length) return resolve(new Set());

        let script;
        try {
            script = ensureScript();
        } catch (err) {
            console.warn("shellIcon: could not stage script:", err?.message);
            return resolve(new Set());
        }

        const child = execFile(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
            { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
            (err, stdout) => {
                if (err) {
                    console.warn("shellIcon: extraction failed:", err?.message);
                    return resolve(new Set());
                }
                try {
                    const parsed = JSON.parse((stdout || "").trim() || "[]");
                    const list = Array.isArray(parsed) ? parsed : [parsed];
                    resolve(new Set(list.filter(r => r?.ok).map(r => r.key)));
                } catch {
                    resolve(new Set());
                }
            }
        );

        child.on("error", () => resolve(new Set()));
        try {
            child.stdin.write(JSON.stringify({ size, entries }));
            child.stdin.end();
        } catch {
            resolve(new Set());
        }
    });
}
