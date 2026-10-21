import {exec, execFile} from "child_process";
import {recordUse} from "../../universal/usage.js";

// Single-quoted PowerShell literal. PowerShell also ends one at the curly
// quotes ‘ ’ ‚ ‛, so every one of them is doubled, not just '.
const psQuote = (value) => `'${String(value).replace(/['‘’‚‛]/g, "$&$&")}'`;

function runAsAdmin(filePath, args) {
    const argList = args ? ` -ArgumentList ${psQuote(args)}` : "";
    execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", `Start-Process -FilePath ${psQuote(filePath)}${argList} -Verb RunAs`],
        { windowsHide: true },
        err => { if (err) console.error('Admin launch failed:', err); }
    );
}

export async function launchApp(app,admin) {
    if (!app) return false;
    try {
        if (app.source === "Steam" && app.appId) {
            exec(`start "" "steam://rungameid/${app.appId}"`, err => { if (err) console.error('Steam launch failed:', err); });
        } else if (admin && (app.path || app.target)) {
            // A shortcut carries its own arguments; a bare Start entry's exe
            // needs them passed alongside.
            if (app.path) runAsAdmin(app.path);
            else runAsAdmin(app.target, app.targetArgs);
        } else if (app.path) {
            exec(`start "" "${app.path}"`, err => { if (err) console.error('Regular launch failed:', err); });
        } else if (app.appId) {
            // Every AppsFolder entry — packaged or not — launches through its
            // AppUserModelID, the same way Start does. Quoted: some IDs contain spaces.
            exec(`start "" "shell:AppsFolder\\${app.appId}"`, err => { if (err) console.error('AppsFolder launch failed:', err); });
        } else {
            return false;
        }

        recordUse(app);
        return true;
    } catch (err) {
        return false;
    }
}
