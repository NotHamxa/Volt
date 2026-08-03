import { execFile } from "child_process";

// Puts the actual file (not its path) on the Windows clipboard so it can be
// pasted into Explorer, an upload dialog, or apps like Claude. Uses PowerShell's
// Set-Clipboard -LiteralPath, which places a real file drop on the clipboard.
export function copyFileToClipboard(filePath) {
    if (!filePath) return;
    const escaped = filePath.replace(/'/g, "''");
    execFile(
        "powershell.exe",
        [
            "-NoProfile",
            "-WindowStyle", "Hidden",
            "-Command",
            `Set-Clipboard -LiteralPath '${escaped}'`,
        ],
        (err) => {
            if (err) console.error("copy-file-clipboard failed:", err);
        }
    );
}
