import { execFile } from "child_process";

// Puts the actual file (not its path) on the Windows clipboard so it can be
// pasted into Explorer, an upload dialog, or apps like Claude. Uses PowerShell's
// Set-Clipboard -LiteralPath, which places a real file drop on the clipboard.
export function copyFileToClipboard(filePath) {
    if (!filePath) return;
    execFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-WindowStyle", "Hidden",
            "-Command",
            // The path travels in an environment variable, never inside the
            // script text: PowerShell ends a quoted string at curly quotes too,
            // so escaping only ' let a file named a’;calc;’.pdf run code.
            "Set-Clipboard -LiteralPath $env:VOLT_CLIPBOARD_PATH",
        ],
        { env: { ...process.env, VOLT_CLIPBOARD_PATH: filePath }, windowsHide: true },
        (err) => {
            if (err) console.error("copy-file-clipboard failed:", err);
        }
    );
}
