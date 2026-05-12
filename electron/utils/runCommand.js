import {exec, spawn} from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import {showNotification} from "./notification.js";

const commandNotifications = {
    "Shutdown":                     { icon: '⏻',  title: 'Shutting down...',           message: 'Your PC will shut down shortly' },
    "Restart":                      { icon: '↺',  title: 'Restarting...',              message: 'Your PC will restart shortly' },
    "Sleep":                        { icon: '🌙', title: 'Going to sleep...',           message: 'Your PC will sleep shortly' },
    "Hibernate":                    { icon: '💤', title: 'Hibernating...',              message: 'Your session will be saved' },
    "Lock Screen":                  { icon: '🔒', title: 'Screen locked',              message: 'Sign in to continue' },
    "Sign Out":                     { icon: '🚪', title: 'Signing out...',              message: 'Your session is ending' },
    "Open Recycle Bin":             { icon: '🗑️', title: 'Recycle Bin opened',         message: '' },
    "Empty Recycle Bin":            { icon: '🗑️', title: 'Recycle Bin emptied',        message: 'All deleted files removed' },
    "Display - PC Screen Only":     { icon: '🖥️', title: 'Display: PC screen only',    message: 'External displays disconnected' },
    "Display - Duplicate":          { icon: '🖥️', title: 'Display: Duplicating',       message: 'Mirroring to all screens' },
    "Display - Extend":             { icon: '🖥️', title: 'Display: Extended',          message: 'Desktop extended across screens' },
    "Display - Second Screen Only": { icon: '🖥️', title: 'Display: Second screen only',message: 'Main display disconnected' },
    "Minimize All Windows":         { icon: '⬇️', title: 'All windows minimized',      message: '' },
    "Restart Windows Explorer":     { icon: '📁', title: 'Explorer restarted',         message: 'Windows Explorer has been restarted' },
    "Flush DNS Cache":              { icon: '🌐', title: 'DNS cache flushed',           message: 'DNS resolver cache cleared' },
    "Show IP Configuration":        { icon: '🌐', title: 'IP Configuration',            message: 'Opening network details...' },
    "Open Network Settings":        { icon: '🌐', title: 'Network Settings',            message: 'Opening network settings...' },
    "Show WiFi Profiles":           { icon: '📶', title: 'WiFi Profiles',               message: 'Opening saved WiFi profiles...' },
    "Open Windows Terminal":        { icon: '⌨️', title: 'Terminal opened',             message: '' },
    "Open System Properties":       { icon: '⚙️', title: 'System Properties',           message: 'Opening system properties...' },
    "Open System Restore":          { icon: '⚙️', title: 'System Restore',              message: 'Opening system restore...' },
};

export function sendCommandNotification(commandName) {
    const notif = commandNotifications[commandName] ?? { icon: '⚡', title: commandName, message: 'Command executed' };
    showNotification({ icon: notif.icon, title: notif.title, message: notif.message });
}

// Heuristic: does this script look like PowerShell vs CMD/batch?
function looksLikePowerShell(script) {
    if (!script) return false;
    return /(^|\n)\s*(#!.*pwsh|#!.*powershell|Get-\w+|Set-\w+|New-\w+|Remove-Item|Write-Host|Write-Output|Invoke-\w+|Start-\w+|Stop-\w+|Test-Path|\$env:|\$\w+\s*=)/.test(script);
}

function resolveShell(item) {
    if (item?.shell === "cmd" || item?.shell === "powershell") return item.shell;
    return looksLikePowerShell(item?.path) ? "powershell" : "cmd";
}

// Shell-aware quoting of a single argument value. The substituted value
// becomes a string literal in the target shell, so embedded quotes can't
// break out and execute injected commands.
function quoteForShell(value, shell) {
    const v = value == null ? "" : String(value);
    if (shell === "powershell") {
        return `'${v.replace(/'/g, "''")}'`;
    }
    // CMD: doubled quotes inside; carets escape special chars outside quotes,
    // but since we're always wrapping in quotes here that's not needed.
    return `"${v.replace(/"/g, '""')}"`;
}

// Substitute `{name}` placeholders. Unknown placeholders are left untouched
// so the user sees an obvious error if a script references a missing arg.
function substituteArgs(script, args, values, shell) {
    if (!script || !args?.length) return script;
    return script.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, key) => {
        const def = args.find(a => a.name === key);
        if (!def) return match;
        const raw = values?.[key] ?? def.defaultValue ?? "";
        return quoteForShell(raw, shell);
    });
}

function writeTempScript(script, ext) {
    const file = path.join(os.tmpdir(), `volt-cmd-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`);
    fs.writeFileSync(file, script, "utf8");
    return file;
}

export async function executeCommandOpen(item, argValues) {
    const shell = resolveShell(item);
    const script = substituteArgs(item.path, item.args, argValues, shell);
    const ext = shell === "powershell" ? ".ps1" : ".bat";
    const tempPath = writeTempScript(script, ext);

    // `start "" <prog>` detaches into a new console window. cmd.exe runs the
    // start verb. The empty title arg ("") prevents start from interpreting a
    // quoted path as the title.
    const args = shell === "powershell"
        ? ["/c", "start", "", "powershell.exe", "-NoExit", "-ExecutionPolicy", "Bypass", "-File", tempPath]
        : ["/c", "start", "", "cmd.exe", "/K", tempPath];

    const child = spawn("cmd.exe", args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
    });
    child.unref();
    sendCommandNotification(item.name);
    return true;
}

export async function executeCommand(item, argValues){
    if (item?.type === "commandOpen" || item?.type === "commandConfirmOpen") {
        return executeCommandOpen(item, argValues);
    }
    const shell = resolveShell(item);
    const script = substituteArgs(item.path, item.args, argValues, shell);
    const shellExe = shell === "powershell" ? "powershell.exe" : "cmd.exe";
    return new Promise((resolve) => {
        if (shell === "powershell") {
            // Pipe the script via stdin to avoid temp files for the no-window path.
            const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"], {
                windowsHide: true,
            });
            child.stdin.write(script);
            child.stdin.end();
            child.on("close", code => {
                if (code !== 0) console.error(`PowerShell command failed (exit ${code}): ${item.name}`);
                sendCommandNotification(item.name);
                resolve(code === 0);
            });
            child.on("error", err => {
                console.error(`PowerShell command error: ${item.name}`, err);
                resolve(false);
            });
        } else {
            exec(script, { shell: shellExe }, (error) => {
                if (error) console.error(`Command failed: ${item.name}`, error);
                sendCommandNotification(item.name);
                resolve(!error);
            });
        }
    });
}
