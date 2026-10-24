import { spawn } from "child_process";

/**
 * The setup guide's "Run it for me" buttons: each opens a PowerShell window
 * with one install or sign-in command already running.
 *
 * Only the commands listed here can be run, picked by name, the renderer
 * never sends a command line. Each is what the vendor's own docs give for
 * Windows.
 */
const STEPS = {
    "claude-install": {
        intro: "Installing Claude Code. This can take a minute and shows no progress until it's done.",
        command: "irm https://claude.ai/install.ps1 | iex",
        outro: "When it says it's installed, open Volt again for the next step.",
    },
    "claude-login": {
        intro: "Signing in to Claude. Finish in the browser window that opens.",
        command: "claude auth login --claudeai",
        outro: "Signed in? Open Volt again and go to AI to start chatting.",
    },
    "codex-install": {
        intro: "Installing Codex with npm. If npm isn't found, install Node.js from https://nodejs.org first.",
        command: "npm install -g @openai/codex",
        outro: "When it's installed, open Volt again for the next step.",
    },
    "codex-login": {
        intro: "Signing in to Codex. Choose 'Sign in with ChatGPT' in the browser window that opens.",
        command: "codex login",
        outro: "Signed in? Open Volt again and go to AI to start chatting.",
    },
};

// Volt's PATH is the one it started with, so a CLI or Node installed since
// would be "not recognised" in a window that inherited it. Read it fresh.
const FRESH_PATH = "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";

const quote = (text) => `'${text.replace(/'/g, "''")}'`;

/** Opens the window for one step. False for an unknown step or another OS. */
export function openSetupTerminal(stepId) {
    const step = Object.hasOwn(STEPS, stepId) ? STEPS[stepId] : null;
    if (!step || process.platform !== "win32") return false;

    const script = [
        FRESH_PATH,
        `Write-Host ${quote(step.intro)} -ForegroundColor Cyan`,
        `Write-Host ${quote(`> ${step.command}`)} -ForegroundColor DarkGray`,
        step.command,
        "Write-Host ''",
        `Write-Host ${quote(step.outro)} -ForegroundColor Green`,
    ].join("; ");

    // Encoded, so nothing in the script is reinterpreted on its way through
    // a command line. Detached gives it a console window of its own.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const env = { ...process.env };
    // Inherited from an agent shell or the node fallback, it would turn
    // anything Electron-based started from this window into plain Node.
    delete env.ELECTRON_RUN_AS_NODE;
    try {
        const child = spawn("powershell.exe", ["-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
            detached: true,
            stdio: "ignore",
            env,
        });
        child.on("error", () => {});
        child.unref();
        return true;
    } catch {
        return false;
    }
}
