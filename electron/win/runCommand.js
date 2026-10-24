import {spawn} from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import {showNotification} from "../universal/notification.js";

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

/**
 * Failure detail goes back to the renderer, which shows it in a notification,
 * so it's truncated here, where a wall of stderr would otherwise land.
 */
function summarise(detail) {
    const text = String(detail ?? "").trim().replace(/\s+/g, " ");
    if (!text) return "The command did not complete successfully";
    return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

// ── Shell detection ─────────────────────────────────────────────────────────

// Approved PowerShell verbs (Get-Verb), plus the few common cmdlets that use
// an unapproved one (ForEach-Object, Where-Object, Sort-Object, Tee-Object).
const PS_VERBS = [
    "add", "approve", "assert", "backup", "block", "build", "checkpoint", "clear", "close", "compare",
    "complete", "compress", "confirm", "connect", "convert", "convertfrom", "convertto", "copy", "debug",
    "deny", "deploy", "disable", "disconnect", "dismount", "edit", "enable", "enter", "exit", "expand",
    "export", "find", "foreach", "format", "get", "grant", "group", "hide", "import", "initialize",
    "install", "invoke", "join", "limit", "lock", "measure", "merge", "mount", "move", "new", "open",
    "optimize", "out", "ping", "pop", "protect", "publish", "push", "read", "receive", "redo", "register",
    "remove", "rename", "repair", "request", "reset", "resize", "resolve", "restart", "restore", "resume",
    "revoke", "save", "search", "select", "send", "set", "show", "skip", "sort", "split", "start", "step",
    "stop", "submit", "suspend", "switch", "sync", "tee", "test", "trace", "unblock", "undo", "uninstall",
    "unlock", "unprotect", "unpublish", "unregister", "update", "use", "wait", "watch", "where", "write",
];

// A cmdlet only counts in command position, line start, or after a pipe,
// `;`, `(`, `{`, `=` or `&`, so a path like `mkdir new-app` isn't mistaken
// for one.
const PS_CMDLET = new RegExp(`(^|[|;({=&])\\s*(${PS_VERBS.join("|")})-[a-z][a-z0-9]*\\b`, "im");
const PS_SIGNALS = [
    PS_CMDLET,
    /\$(env:|[a-z_][a-z0-9_]*\b|\{|\()/i,        // $variables, ${...}, $(...)
    /\[[a-z][\w.]*\]::/i,                          // [Type]::Member
    /\|\s*(%|\?|foreach|where)\s*\{/i,             // pipelines into script blocks
    /(^|\n)\s*#!.*(pwsh|powershell)/i,
    /(^|\n)\s*(param\s*\(|function\s+[\w-]+\s*[({])/i,
];
// Things PowerShell 5.1 can't run. Any of these means the script is batch.
const CMD_SIGNALS = [
    /(^|\n)\s*@?echo\s+(off|on)\b/i,
    /(^|\n)\s*(@?rem\b|::)/i,
    /%[a-z_][\w]*%|%%[a-z]|%~/i,
    /(^|\n)\s*(goto|setlocal|endlocal)\b/i,
    /\bset\s+\/[ap]\b/i,
    /\bexit\s+\/b\b/i,
    /\bif\s+(not\s+)?(errorlevel|exist|defined)\b/i,
    /&&|\|\|/,
    />\s*nul\b/i,
];

/** Drops quoted text, so a cmdlet mentioned inside a string doesn't count. */
function withoutStrings(script) {
    return script.replace(/"[^"\n]*"/g, '""').replace(/'[^'\n]*'/g, "''");
}

// Heuristic: does this script look like PowerShell vs CMD/batch? Batch-only
// syntax wins, since running a .bat through PowerShell is the worse mistake.
function looksLikePowerShell(script) {
    if (!script) return false;
    const code = withoutStrings(script);
    if (CMD_SIGNALS.some(re => re.test(code))) return false;
    return PS_SIGNALS.some(re => re.test(code));
}

export function resolveShell(item) {
    if (item?.shell === "cmd" || item?.shell === "powershell") return item.shell;
    return looksLikePowerShell(item?.path) ? "powershell" : "cmd";
}

// ── Argument substitution ───────────────────────────────────────────────────
//
// A value becomes a literal in whatever quoting context its placeholder sits
// in. Authors often write `"{x}"` or `Write-Host "Hi {x}"` themselves, so a
// placeholder already inside quotes is escaped for that string rather than
// wrapped in another layer, double wrapping is exactly what lets a value
// close the author's quotes and run.

const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/y;

// PowerShell ends a '…' string at any of these, and a "…" string at any of
// the second set; doubling one inside the string makes it literal.
const PS_SQ = "'‘’‚‛";
const PS_DQ = "\"“”„";
const isPsSq = c => c !== undefined && PS_SQ.includes(c);
const isPsDq = c => c !== undefined && PS_DQ.includes(c);

const noNewlines = v => v.replace(/[\r\n]+/g, " ");
const psDoubleSq = v => v.replace(/['‘’‚‛]/g, c => c + c);
const psBacktick = v => v.replace(/[`$"“”„]/g, c => "`" + c);

const psQuote = {
    code: v => `'${psDoubleSq(v)}'`,
    sq: v => psDoubleSq(v),
    dq: v => psBacktick(v),
    // A here-string only ends at `'@` / `"@` at the start of a line.
    sqHere: v => noNewlines(v),
    dqHere: v => psBacktick(noNewlines(v)),
    // A newline would end the comment and run the rest.
    comment: v => noNewlines(v).replace(/#>/g, "# >"),
};

/**
 * Walks a PowerShell script, tracking string/comment context, and replaces
 * each declared placeholder with the value quoted for where it sits.
 * `$(…)` inside a double-quoted string is code again, and handled as such.
 */
function substitutePowerShell(script, resolve) {
    // Frames: code (with paren depth when inside "$(…)"), sq, dq, sqHere,
    // dqHere, line / block comment.
    const stack = [{ t: "code", sub: false, depth: 0 }];
    const top = () => stack[stack.length - 1];
    let out = "";
    let i = 0;
    const n = script.length;

    while (i < n) {
        const c = script[i];
        const next = script[i + 1];
        const frame = top();

        if (c === "{") {
            PLACEHOLDER.lastIndex = i;
            const m = PLACEHOLDER.exec(script);
            const value = m ? resolve(m[1]) : undefined;
            if (value !== undefined) {
                const kind = frame.t === "line" || frame.t === "block" ? "comment" : frame.t;
                // `"${x}"` would otherwise read the value as a variable name or,
                // for `(…)`, a subexpression. Make that `$` literal instead.
                if ((kind === "dq" || kind === "dqHere") && out.endsWith("$") && !out.endsWith("`$")) {
                    out = out.slice(0, -1) + "`$";
                }
                out += psQuote[kind](value);
                i += m[0].length;
                continue;
            }
        }

        switch (frame.t) {
            case "code": {
                if (c === "`") { out += c + (next ?? ""); i += 2; continue; }
                if (c === "<" && next === "#") { stack.push({ t: "block" }); out += "<#"; i += 2; continue; }
                if (c === "#" && (i === 0 || /[\s;|(){}]/.test(script[i - 1]))) { stack.push({ t: "line" }); break; }
                if (c === "@" && (isPsSq(next) || isPsDq(next)) && /^[ \t]*\r?\n/.test(script.slice(i + 2))) {
                    stack.push({ t: isPsSq(next) ? "sqHere" : "dqHere" });
                    out += c + next; i += 2; continue;
                }
                if (isPsSq(c)) { stack.push({ t: "sq" }); break; }
                if (isPsDq(c)) { stack.push({ t: "dq" }); break; }
                if (frame.sub && c === "(") frame.depth++;
                if (frame.sub && c === ")") {
                    if (frame.depth === 0) stack.pop();
                    else frame.depth--;
                }
                break;
            }
            case "sq":
                if (isPsSq(c)) {
                    if (isPsSq(next)) { out += c + next; i += 2; continue; }
                    stack.pop();
                }
                break;
            case "dq":
            case "dqHere":
                if (c === "`") { out += c + (next ?? ""); i += 2; continue; }
                if (c === "$" && next === "(") {
                    stack.push({ t: "code", sub: true, depth: 0 });
                    out += "$("; i += 2; continue;
                }
                if (frame.t === "dq" && isPsDq(c)) {
                    if (isPsDq(next)) { out += c + next; i += 2; continue; }
                    stack.pop();
                }
                if (frame.t === "dqHere" && isPsDq(c) && next === "@" && script[i - 1] === "\n") {
                    stack.pop();
                    out += c + next; i += 2; continue;
                }
                break;
            case "sqHere":
                if (isPsSq(c) && next === "@" && script[i - 1] === "\n") {
                    stack.pop();
                    out += c + next; i += 2; continue;
                }
                break;
            case "line":
                if (c === "\n") stack.pop();
                break;
            case "block":
                if (c === "#" && next === ">") { stack.pop(); out += "#>"; i += 2; continue; }
                break;
        }
        out += c;
        i++;
    }
    return out;
}

// Inside cmd's quotes `"` is doubled (which keeps quote parity, so nothing in
// the value lands outside them) and `%` is doubled because every cmd script
// runs from a .bat, where a lone `%` would expand. A newline would start a new
// command, so it can't survive either.
const cmdEscape = v => noNewlines(v).replace(/"/g, '""').replace(/%/g, "%%");

/**
 * cmd's quoting is a toggle per line: `"` flips it, `^` escapes the next
 * character outside quotes, and a newline resets it.
 */
function substituteCmd(script, resolve) {
    let out = "";
    let quoted = false;
    let i = 0;
    const n = script.length;
    while (i < n) {
        const c = script[i];
        if (c === "{") {
            PLACEHOLDER.lastIndex = i;
            const m = PLACEHOLDER.exec(script);
            const value = m ? resolve(m[1]) : undefined;
            if (value !== undefined) {
                out += quoted ? cmdEscape(value) : `"${cmdEscape(value)}"`;
                i += m[0].length;
                continue;
            }
        }
        if (c === "\n") quoted = false;
        else if (c === "^" && !quoted && i + 1 < n) { out += c + script[i + 1]; i += 2; continue; }
        else if (c === '"') quoted = !quoted;
        out += c;
        i++;
    }
    return out;
}

// Substitute `{name}` placeholders. Unknown placeholders are left untouched
// so the user sees an obvious error if a script references a missing arg.
export function substituteArgs(script, args, values, shell) {
    if (!script || !args?.length) return script;
    const resolve = (key) => {
        const def = args.find(a => a.name === key);
        if (!def) return undefined;
        const raw = values?.[key] ?? def.defaultValue ?? "";
        return String(raw);
    };
    return shell === "powershell"
        ? substitutePowerShell(script, resolve)
        : substituteCmd(script, resolve);
}

// ── Temp scripts ────────────────────────────────────────────────────────────

const TEMP_DIR = path.join(os.tmpdir(), "volt-commands");
// Visible terminals may still be reading their script, so leftovers are only
// swept once they're well past any plausible run.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

function sweepStaleScripts() {
    fs.promises.readdir(TEMP_DIR).then(names => {
        const cutoff = Date.now() - STALE_AFTER_MS;
        for (const name of names) {
            const file = path.join(TEMP_DIR, name);
            fs.promises.stat(file)
                .then(st => st.mtimeMs < cutoff ? fs.promises.unlink(file) : null)
                .catch(() => {});
        }
    }).catch(() => {});
}

function removeQuietly(file) {
    if (file) fs.promises.unlink(file).catch(() => {});
}

// `@(goto)` ends the batch, but the rest of the already-parsed line still runs
//, the standard way for a .bat to delete itself without an error.
const BAT_SELF_DELETE = '@(goto) 2>nul & del "%~f0"';

/**
 * Writes the script where the target shell will read it correctly. Windows
 * PowerShell 5.1 treats a .ps1 without a BOM as ANSI; cmd reads a .bat in the
 * OEM code page until told otherwise, and prefers CRLF line endings.
 */
function writeTempScript(script, shell, { selfDelete = false } = {}) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const ext = shell === "powershell" ? ".ps1" : ".bat";
    const file = path.join(TEMP_DIR, `volt-cmd-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`);
    let content;
    if (shell === "powershell") {
        content = "﻿" + script;
    } else {
        const lines = ["@chcp 65001>nul", script.replace(/\r?\n/g, "\r\n")];
        if (selfDelete) lines.push(BAT_SELF_DELETE);
        content = lines.join("\r\n") + "\r\n";
    }
    fs.writeFileSync(file, content, "utf8");
    return file;
}

// ── Running ─────────────────────────────────────────────────────────────────

const HIDDEN_TIMEOUT_MS = 2 * 60 * 1000;
const OUTPUT_TAIL = 4096;
// A process that exits leaves its stdout open if it started something that
// inherited it (`start "" notepad`); don't wait on those for the output.
const CLOSE_GRACE_MS = 300;
// CreateProcess caps the whole command line at 32767 characters.
const MAX_ENCODED_COMMAND = 30000;

/** Error records from PowerShell's CLIXML stderr, as readable text. */
function readPowerShellStderr(text) {
    if (!text.startsWith("#< CLIXML")) return text;
    const errors = [...text.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map(m => m[1]);
    return errors.join("")
        .replace(/_x([0-9A-F]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function killTree(pid) {
    if (!pid) return;
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", () => {});
}

/**
 * Runs a script with no window and settles exactly once: on exit, on a spawn
 * error, or on the timeout (which takes the whole process tree down with it).
 * stdin is closed so `pause`, `set /p` and Read-Host can't wait for input.
 */
function runHidden(item, shell, script) {
    return new Promise((resolve) => {
        let tempPath = null;
        let file;
        let args;
        let verbatim = false;
        try {
            if (shell === "powershell") {
                const encoded = Buffer.from(script, "utf16le").toString("base64");
                const base = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];
                if (encoded.length <= MAX_ENCODED_COMMAND) {
                    args = [...base, "-EncodedCommand", encoded];
                } else {
                    tempPath = writeTempScript(script, shell);
                    args = [...base, "-File", tempPath];
                }
                file = "powershell.exe";
            } else {
                tempPath = writeTempScript(script, shell);
                // /s strips the outer quotes and runs the rest verbatim, so a
                // temp path with spaces survives.
                file = "cmd.exe";
                args = [`/d /s /c ""${tempPath}""`];
                verbatim = true;
            }
        } catch (err) {
            removeQuietly(tempPath);
            resolve({ ok: false, detail: summarise(err?.message ?? err) });
            return;
        }

        let settled = false;
        let stdout = "";
        let stderr = "";
        let timer = null;
        let graceTimer = null;
        const tail = (acc, chunk) => (acc + chunk).slice(-OUTPUT_TAIL);

        const settle = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(graceTimer);
            removeQuietly(tempPath);
            if (result.ok) sendCommandNotification(item.name);
            else console.error(`Command failed: ${item.name}`, result.detail);
            resolve(result.ok ? { ok: true } : { ok: false, detail: summarise(result.detail) });
        };

        let child;
        try {
            child = spawn(file, args, {
                windowsHide: true,
                windowsVerbatimArguments: verbatim,
                stdio: ["ignore", "pipe", "pipe"],
            });
        } catch (err) {
            settle({ ok: false, detail: err?.message });
            return;
        }

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", chunk => { stdout = tail(stdout, chunk); });
        child.stderr.on("data", chunk => { stderr = tail(stderr, chunk); });
        // Streams can error when the tree is killed; the exit event reports it.
        child.stdout.on("error", () => {});
        child.stderr.on("error", () => {});

        const finish = (code) => {
            if (code === 0) {
                settle({ ok: true });
                return;
            }
            const err = shell === "powershell" ? readPowerShellStderr(stderr) : stderr;
            settle({ ok: false, detail: err.trim() || stdout.trim() || `Exited with code ${code}` });
        };

        child.on("error", err => settle({ ok: false, detail: err?.message }));
        child.on("close", code => finish(code));
        child.on("exit", code => {
            graceTimer = setTimeout(() => finish(code), CLOSE_GRACE_MS);
        });

        timer = setTimeout(() => {
            killTree(child.pid);
            settle({ ok: false, detail: `Timed out after ${HIDDEN_TIMEOUT_MS / 60000} minutes and was stopped.` });
        }, HIDDEN_TIMEOUT_MS);
    });
}

export async function executeCommandOpen(item, argValues) {
    const shell = resolveShell(item);
    const script = substituteArgs(item.path, item.args, argValues, shell);
    sweepStaleScripts();

    let tempPath;
    try {
        // The .bat deletes itself when it finishes. PowerShell reads the whole
        // .ps1 at startup, so that one is removed shortly after launch instead.
        tempPath = writeTempScript(script, shell, { selfDelete: true });
    } catch (err) {
        return { ok: false, detail: summarise(err?.message ?? err) };
    }

    // `start "" <prog>` detaches into a new console window. cmd.exe runs the
    // start verb. The empty title arg ("") prevents start from interpreting a
    // quoted path as the title.
    const args = shell === "powershell"
        ? ["/c", "start", "", "powershell.exe", "-NoExit", "-ExecutionPolicy", "Bypass", "-File", tempPath]
        : ["/c", "start", "", "cmd.exe", "/K", tempPath];

    // Detached, so the script's own exit code belongs to the terminal it
    // opened. Only whether the terminal launched can be reported from here.
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn("cmd.exe", args, { detached: true, stdio: "ignore", windowsHide: false });
        } catch (err) {
            removeQuietly(tempPath);
            resolve({ ok: false, detail: summarise(err?.message ?? err) });
            return;
        }
        child.once("spawn", () => {
            if (shell === "powershell") setTimeout(() => removeQuietly(tempPath), 60 * 1000).unref();
            child.unref();
            sendCommandNotification(item.name);
            resolve({ ok: true });
        });
        child.once("error", err => {
            removeQuietly(tempPath);
            resolve({ ok: false, detail: summarise(err?.message) });
        });
    });
}

/**
 * Failures come back as `{ ok: false, detail }` and are the caller's to show
 *, the renderer notifies on every path that runs a command, so notifying
 * here too would report each failure twice.
 */
export async function executeCommand(item, argValues){
    if (item?.type === "commandOpen" || item?.type === "commandConfirmOpen") {
        return executeCommandOpen(item, argValues);
    }
    const shell = resolveShell(item);
    const script = substituteArgs(item.path, item.args, argValues, shell);
    sweepStaleScripts();
    return runHidden(item, shell, script ?? "");
}
