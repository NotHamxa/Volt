import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { registerProvider } from "./provider.js";
import { codexAuthMode } from "./cliAuth.js";
import { workspaceDir } from "./workspace.js";

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

const SANDBOX_CONTROL = {
    id: "sandbox",
    label: "Sandbox",
    type: "select",
    options: [
        { id: "read-only", label: "Read only" },
        { id: "workspace-write", label: "Workspace write" },
    ],
    default: "read-only",
};

// Only reached when the app-server can't be asked. The sentinel is a real
// string rather than "" because Radix's Select rejects empty values.
const DEFAULT_MODEL = "default";
const FALLBACK_MODELS = [
    { id: DEFAULT_MODEL, label: "CLI default", controls: [SANDBOX_CONTROL] },
];

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The real catalogue, from the CLI's app-server rather than a list typed out
 * here. `codex exec` has no models command, but `codex app-server` speaks
 * newline-delimited JSON-RPC and answers `model/list` with each model's
 * supported reasoning efforts — which genuinely differ between them.
 *
 * Cached for the process lifetime: this costs a spawn and a handshake.
 */
let modelCache = null;

async function fetchModels() {
    if (modelCache) return modelCache;

    const bin = findCodexBinary();
    if (!bin) return FALLBACK_MODELS;

    const child = spawn(bin, ["app-server"], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    const pending = new Map();
    let nextId = 1;

    const call = (method, params) => new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });

    let buffer = "";
    child.stdout.on("data", (data) => {
        buffer += data.toString("utf8");
        let index;
        while ((index = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (!line) continue;
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                continue; // notifications and log lines share the pipe
            }
            const waiter = pending.get(message.id);
            if (!waiter) continue;
            pending.delete(message.id);
            if (message.error) waiter.reject(new Error(message.error.message ?? "app-server error"));
            else waiter.resolve(message.result);
        }
    });
    child.on("error", (err) => {
        for (const { reject } of pending.values()) reject(err);
        pending.clear();
    });

    const timeout = setTimeout(() => {
        for (const { reject } of pending.values()) reject(new Error("timed out"));
        pending.clear();
        try { child.kill(); } catch { /* already gone */ }
    }, 15000);
    timeout.unref?.();

    try {
        await call("initialize", {
            clientInfo: { name: "volt", title: "Volt", version: "1.0.0" },
        });

        const models = [];
        let cursor = null;
        // Paginated, so keep asking until the server stops handing back a cursor.
        do {
            const page = await call("model/list", cursor ? { cursor } : {});
            models.push(...(page?.data ?? []));
            cursor = page?.nextCursor ?? null;
        } while (cursor && models.length < 200);

        const visible = models.filter(m => !m.hidden && m.id);
        if (!visible.length) return FALLBACK_MODELS;

        modelCache = visible.map(m => ({
            id: m.id,
            label: m.displayName ?? m.id,
            controls: [...effortControl(m), SANDBOX_CONTROL],
        }));
        return modelCache;
    } finally {
        clearTimeout(timeout);
        try { child.stdin.end(); } catch { /* already closed */ }
        try { child.kill(); } catch { /* already gone */ }
    }
}

/** Each model advertises its own levels — sol offers "ultra", luna doesn't. */
function effortControl(model) {
    const levels = (model.supportedReasoningEfforts ?? [])
        .map(entry => (typeof entry === "string" ? entry : entry?.reasoningEffort))
        .filter(Boolean);
    if (!levels.length) return [];
    return [{
        id: "effort",
        label: "Reasoning",
        type: "select",
        options: levels.map(level => ({ id: level, label: titleCase(level) })),
        default: levels.includes(model.defaultReasoningEffort)
            ? model.defaultReasoningEffort
            : levels[0],
    }];
}

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
        try {
            return await fetchModels();
        } catch (err) {
            console.warn("Could not read the Codex model list:", err?.message ?? err);
            return FALLBACK_MODELS;
        }
    },

    billing() {
        return codexAuthMode();
    },

    // Models carry their own reasoning levels; the sandbox is the only knob
    // that applies uniformly.
    controls() {
        return [SANDBOX_CONTROL];
    },

    async *send({ prompt, sessionId, model, settings, signal }) {
        const bin = findCodexBinary();
        if (!bin) {
            yield { type: "error", message: "Codex CLI not found." };
            return;
        }

        const root = workspaceDir();
        // --cd sets Codex's own workspace root; the spawn cwd keeps anything
        // it shells out to in the same place.
        const args = ["exec", "--json", "--skip-git-repo-check", "--color", "never", "--cd", root];
        if (model && model !== DEFAULT_MODEL) args.push("--model", model);
        // Reasoning effort has no flag of its own; it's a config override.
        if (settings?.effort) args.push("-c", `model_reasoning_effort="${settings.effort}"`);
        args.push("--sandbox", settings?.sandbox ?? "read-only");
        // A resumed thread takes the prompt after the session id.
        if (sessionId) args.push("resume", sessionId, prompt);
        else args.push(prompt);

        const child = spawn(bin, args, {
            cwd: root,
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
