import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { registerProvider } from "./provider.js";

/**
 * Codex through the user's installed CLI, driven by `codex exec --json`.
 *
 * Spawned directly rather than through @openai/codex-sdk: that package depends
 * on @openai/codex, which ships its own copy of the binary — the same
 * duplicate-a-large-binary problem the Claude adapter avoids. Auth comes from
 * the user's existing `codex login`.
 *
 * `thread.started` carries the id that `codex exec resume <id>` needs, which is
 * what makes follow-up turns continue a conversation rather than restart it.
 */

const BIN_NAME = process.platform === "win32" ? "codex.exe" : "codex";

function candidatePaths() {
    const home = os.homedir();
    return [
        path.join(home, "AppData", "Local", "Programs", "OpenAI", "Codex", "bin", BIN_NAME),
        path.join(home, ".local", "bin", BIN_NAME),
        path.join(home, "AppData", "Roaming", "npm", BIN_NAME),
        "/usr/local/bin/codex",
        "/opt/homebrew/bin/codex",
    ];
}

let cachedPath;

export function findCodexBinary() {
    if (cachedPath !== undefined) return cachedPath;
    for (const candidate of candidatePaths()) {
        try {
            if (fs.existsSync(candidate)) {
                cachedPath = candidate;
                return cachedPath;
            }
        } catch { /* keep looking */ }
    }
    cachedPath = null;
    return cachedPath;
}

// Left to the CLI's own default unless the user picks one, so this list can't
// go stale in the way a hard-coded catalogue would. The sentinel is a real
// string rather than "" because Radix's Select rejects empty values.
const DEFAULT_MODEL = "default";
const MODELS = [
    { id: DEFAULT_MODEL, label: "CLI default" },
    { id: "gpt-5-codex", label: "gpt-5-codex" },
    { id: "gpt-5", label: "gpt-5" },
];

const SANDBOX = [
    { id: "read-only", label: "Read only" },
    { id: "workspace-write", label: "Workspace write" },
];

/**
 * Turns a child process's stdout into lines. Chunks split mid-line, so the
 * tail is held back until its newline arrives.
 */
async function* jsonLines(child, signal) {
    let buffer = "";
    const queue = [];
    let notify;
    let finished = false;
    let failure = null;

    child.stdout.on("data", (data) => {
        buffer += data.toString("utf8");
        let index;
        while ((index = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (line) queue.push(line);
        }
        notify?.();
    });
    child.on("error", (err) => { failure = err; finished = true; notify?.(); });
    child.on("close", () => {
        const tail = buffer.trim();
        if (tail) queue.push(tail);
        finished = true;
        notify?.();
    });

    const onAbort = () => { try { child.kill(); } catch { /* already gone */ } };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
        while (true) {
            while (queue.length) yield queue.shift();
            if (finished) break;
            await new Promise(resolve => { notify = resolve; });
            notify = null;
        }
        if (failure) throw failure;
    } finally {
        signal?.removeEventListener("abort", onAbort);
    }
}

export const codexProvider = registerProvider({
    id: "codex",
    label: "Codex CLI",
    kind: "subscription-cli",
    needsKey: false,

    async isAvailable() {
        const bin = findCodexBinary();
        if (bin) return { available: true, detail: bin };
        return { available: false, detail: "Codex CLI not found. Install it, then re-check." };
    },

    async models() {
        return MODELS;
    },

    controls() {
        return [
            { id: "sandbox", label: "Sandbox", type: "select", options: SANDBOX, default: "read-only" },
        ];
    },

    async *send({ prompt, sessionId, model, settings, signal }) {
        const bin = findCodexBinary();
        if (!bin) {
            yield { type: "error", message: "Codex CLI not found." };
            return;
        }

        const args = ["exec", "--json", "--skip-git-repo-check", "--color", "never"];
        if (model && model !== DEFAULT_MODEL) args.push("--model", model);
        args.push("--sandbox", settings?.sandbox ?? "read-only");
        // A resumed thread takes the prompt after the session id.
        if (sessionId) args.push("resume", sessionId, prompt);
        else args.push(prompt);

        const child = spawn(bin, args, {
            // Without this the CLI waits on stdin for extra input and never
            // starts the turn.
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        let stderr = "";
        child.stderr.on("data", (data) => { stderr += data.toString("utf8"); });

        let resolvedSession = sessionId ?? null;
        let sawText = false;
        try {
            for await (const line of jsonLines(child, signal)) {
                let event;
                try {
                    event = JSON.parse(line);
                } catch {
                    continue; // banner or progress noise, not an event
                }

                if (event.type === "thread.started" && event.thread_id) {
                    resolvedSession = event.thread_id;
                    continue;
                }

                // Newer builds may stream deltas; take them when offered and
                // fall back to the completed message when they're absent.
                if (event.type === "item.delta" && event.delta?.text) {
                    sawText = true;
                    yield { type: "text", text: event.delta.text };
                    continue;
                }

                if (event.type === "item.completed" && event.item?.type === "agent_message") {
                    if (!sawText && event.item.text) {
                        yield { type: "text", text: event.item.text };
                    }
                    sawText = false;
                    continue;
                }

                if (event.type === "turn.failed" || event.type === "error") {
                    const message = event.error?.message ?? event.message ?? "The turn failed.";
                    yield { type: "error", message };
                }
            }
        } catch (err) {
            if (!signal?.aborted) {
                yield { type: "error", message: err?.message ?? "Could not run the Codex CLI." };
                return;
            }
        }

        // A non-zero exit with nothing on stdout means the failure is in stderr.
        if (!signal?.aborted && child.exitCode && child.exitCode !== 0 && stderr.trim()) {
            yield { type: "error", message: stderr.trim().slice(0, 300) };
        }

        yield { type: "done", sessionId: resolvedSession ?? undefined };
    },
});
