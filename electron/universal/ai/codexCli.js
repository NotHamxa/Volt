import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { registerProvider, withResumeFallback } from "./provider.js";
import { codexAuthMode } from "./cliAuth.js";
import { workspaceDir } from "./workspace.js";
import { describeCodexItem, describeCodexInput, clipOutput } from "./trace.js";
import { fileImages } from "./stepImages.js";
import { resolveCli, killTree, track } from "./cliProcess.js";
import { expandAttachments } from "./attachments.js";

/**
 * Codex through the user's installed CLI, driven over `codex app-server`.
 *
 * Spawned directly rather than through @openai/codex-sdk: that package depends
 * on @openai/codex, which ships its own copy of the binary, the same
 * duplicate-a-large-binary problem the Claude adapter avoids. Auth comes from
 * the user's existing `codex login`.
 *
 * The app-server rather than `codex exec --json`, because exec can't ask:
 * a command that needed approval was simply refused, so the only choices
 * were a sandbox that blocked the work or one that allowed everything. Over
 * the app-server's JSON-RPC, Codex asks and the person at the keyboard
 * answers, the same approval prompts Claude uses. It also streams the answer
 * and its reasoning summaries as they're written, where exec delivered each
 * message whole.
 *
 * One app-server per turn: the thread lives on disk, and `thread/resume`
 * picks it back up, so nothing has to be kept running between questions.
 */

const BIN_NAME = process.platform === "win32" ? "codex.exe" : "codex";

// Known install folders, checked before PATH and the npm shim folder.
function candidatePaths() {
    const home = os.homedir();
    return [
        path.join(home, "AppData", "Local", "Programs", "OpenAI", "Codex", "bin", BIN_NAME),
        path.join(home, ".local", "bin", BIN_NAME),
        "/usr/local/bin/codex",
        "/opt/homebrew/bin/codex",
    ];
}

/** `{ path, command, args, env }` for the installed CLI, or null. */
export function findCodexBinary() {
    return resolveCli("codex", candidatePaths());
}

function spawnCodex(cli, args, options) {
    return track(spawn(cli.command, [...cli.args, ...args], {
        ...options,
        env: { ...process.env, ...cli.env },
        windowsHide: true,
    }));
}

/**
 * How much Codex may do without asking. Each is a pairing of the sandbox the
 * commands run in and when Codex has to stop and ask, the same four modes,
 * in the same words, as Claude's picker, so switching provider doesn't mean
 * learning a second vocabulary. Picking one makes it the default for new
 * conversations too.
 */
const MODE_CONTROL = {
    id: "mode",
    label: "Mode",
    type: "select",
    sticky: true,
    options: [
        { id: "ask", label: "Ask first", detail: "Reads freely; asks before changing files or running anything else" },
        { id: "edits", label: "Auto-edit", detail: "Edits inside the workspace go ahead; asks to go further" },
        { id: "auto", label: "Auto", detail: "A reviewer model approves routine requests; asks about the rest" },
        { id: "full", label: "Full access", detail: "No sandbox: any file, any command, the network", danger: true },
    ],
    default: "ask",
};
const MODES = new Set(MODE_CONTROL.options.map(o => o.id));

/** Mode → the sandbox and approval policy the app-server is given. */
const MODE_POLICY = {
    ask: { sandbox: "read-only", approvalPolicy: "untrusted", approvalsReviewer: "user" },
    edits: { sandbox: "workspace-write", approvalPolicy: "on-request", approvalsReviewer: "user" },
    auto: { sandbox: "workspace-write", approvalPolicy: "on-request", approvalsReviewer: "auto_review" },
    full: { sandbox: "danger-full-access", approvalPolicy: "never", approvalsReviewer: "user" },
};

/** Chats from before modes picked a sandbox instead; each maps to its nearest mode. */
const LEGACY_SANDBOX = { "read-only": "ask", "workspace-write": "edits", "danger-full-access": "full" };

function resolveMode(settings) {
    if (MODES.has(settings?.mode)) return settings.mode;
    return LEGACY_SANDBOX[settings?.sandbox] ?? "ask";
}

// Only reached when the app-server can't be asked. The sentinel is a real
// string rather than "" because Radix's Select rejects empty values.
const DEFAULT_MODEL = "default";
const FALLBACK_MODELS = [
    { id: DEFAULT_MODEL, label: "CLI default", controls: [MODE_CONTROL] },
];
// A stand-in, not the CLI's own list: the saved catalogue ignores it.
FALLBACK_MODELS.fallback = true;

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const CLIENT_INFO = { name: "volt", title: "Volt", version: "1.0.0" };

// --- JSON-RPC ----------------------------------------------------------------

/**
 * Newline-delimited JSON-RPC over a child's stdio, both ways: calls go out
 * and get answered, and the server sends notifications and requests of its
 * own, an approval is a request *from* Codex, answered with `respond`.
 */
function rpcClient(child, { onNotification, onRequest, trace } = {}) {
    const pending = new Map();
    let nextId = 1;
    let buffer = "";
    let closed = null;

    const send = (message) => {
        if (closed) return;
        try {
            child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
        } catch { /* the close handler reports it */ }
    };

    const fail = (err) => {
        closed ??= err;
        for (const { reject } of pending.values()) reject(err);
        pending.clear();
    };

    // Decoded by the stream, not per chunk: a chunk can end halfway through a
    // multi-byte character, and decoding it alone mangles that character.
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
        buffer += data;
        let index;
        while ((index = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (!line) continue;
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                continue; // log noise sharing the pipe
            }
            if (message.method && message.id !== undefined) {
                trace?.({ request: message });
                onRequest?.(message);
            } else if (message.method) {
                // Deltas are too many to be worth keeping; the completed
                // items carry the same text.
                if (!/\/(delta|outputDelta|summaryTextDelta|textDelta)$/.test(message.method)) trace?.(message);
                onNotification?.(message);
            } else {
                const waiter = pending.get(message.id);
                if (!waiter) continue;
                pending.delete(message.id);
                if (message.error) waiter.reject(Object.assign(new Error(message.error.message ?? "app-server error"), { rpc: message.error }));
                else waiter.resolve(message.result);
            }
        }
    });
    child.on("error", fail);
    child.on("close", (code) => fail(new Error(`Codex app-server exited${code ? ` with code ${code}` : ""}`)));
    // A write after the server died would otherwise throw unhandled.
    child.stdin.on("error", () => {});

    return {
        call: (method, params) => new Promise((resolve, reject) => {
            if (closed) { reject(closed); return; }
            const id = nextId++;
            pending.set(id, { resolve, reject });
            send({ id, method, params });
        }),
        notify: (method, params) => send(params === undefined ? { method } : { method, params }),
        respond: (id, result) => send({ id, result }),
        respondError: (id, message) => send({ id, error: { code: -32601, message } }),
        get closed() { return closed; },
    };
}

/** The handshake every app-server connection starts with. */
async function initialize(rpc) {
    await rpc.call("initialize", {
        clientInfo: CLIENT_INFO,
        // Approval routing (`approvalsReviewer`) is behind the experimental flag.
        capabilities: { experimentalApi: true, optOutNotificationMethods: ["turn/diff/updated"] },
    });
    rpc.notify("initialized");
}

// --- models -------------------------------------------------------------------

/**
 * The real catalogue, from the CLI's app-server rather than a list typed out
 * here: `model/list` answers with each model's supported reasoning efforts,
 * which genuinely differ between them.
 *
 * Cached for the process lifetime: this costs a spawn and a handshake.
 */
let modelCache = null;

async function fetchModels() {
    if (modelCache) return modelCache;

    const cli = findCodexBinary();
    if (!cli) return FALLBACK_MODELS;

    const child = spawnCodex(cli, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] });
    const rpc = rpcClient(child);
    const timeout = setTimeout(() => killTree(child), 15000);
    timeout.unref?.();

    try {
        await initialize(rpc);

        const models = [];
        let cursor = null;
        // Paginated, so keep asking until the server stops handing back a cursor.
        do {
            const page = await rpc.call("model/list", cursor ? { cursor } : {});
            models.push(...(page?.data ?? []));
            cursor = page?.nextCursor ?? null;
        } while (cursor && models.length < 200);

        const visible = models.filter(m => !m.hidden && m.id);
        if (!visible.length) return FALLBACK_MODELS;

        modelCache = visible.map(m => ({
            id: m.id,
            label: m.displayName ?? m.id,
            controls: [...effortControl(m), MODE_CONTROL],
        }));
        return modelCache;
    } finally {
        clearTimeout(timeout);
        try { child.stdin.end(); } catch { /* already closed */ }
        killTree(child);
    }
}

/** Each model advertises its own levels, sol offers "ultra", luna doesn't. */
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

// Used when the catalogue hasn't been read; otherwise the model's own list.
const KNOWN_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "ultra"]);

/** Settings arrive from the renderer; only levels the model actually offers get through. */
function allowedEffort(model, effort) {
    if (typeof effort !== "string") return null;
    const levels = modelCache
        ?.find(m => m.id === model)
        ?.controls.find(c => c.id === "effort")
        ?.options.map(o => o.id);
    const allowed = levels?.length ? levels.includes(effort) : KNOWN_EFFORTS.has(effort);
    return allowed && /^[a-z]+$/.test(effort) ? effort : null;
}

export const codexProvider = registerProvider({
    id: "codex",
    label: "Codex CLI",
    kind: "subscription-cli",

    async isAvailable() {
        const cli = findCodexBinary();
        if (cli) return { available: true, detail: cli.path };
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

    // Models carry their own reasoning levels; the mode is the only knob
    // that applies uniformly.
    controls() {
        return [MODE_CONTROL];
    },

    async *send({ prompt, attachments, sessionId, history, model, settings, signal, toolless, requestPermission, trace }) {
        const cli = findCodexBinary();
        if (!cli) {
            yield { type: "error", message: "Codex CLI not found." };
            yield { type: "done" };
            return;
        }

        const run = (turn) => runTurn({ cli, ...turn, attachments, model, settings, signal, toolless, requestPermission, trace });
        // A one-shot completion has no thread to resume or transcript to replay.
        if (toolless) yield* run({ sessionId: null, prompt });
        else yield* withResumeFallback({ sessionId, prompt, history, run });
    },
});

/**
 * Whether the user's own Codex config already picks a Windows sandbox, in
 * which case theirs stands. Read fresh each turn: it's one small file, and a
 * change made in a terminal should apply without restarting Volt.
 */
function configSetsWindowsSandbox() {
    const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    try {
        const text = fs.readFileSync(path.join(home, "config.toml"), "utf8");
        // The [windows] table, up to the next table header.
        const table = /^\s*\[windows\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m.exec(text)?.[1] ?? "";
        return /^\s*sandbox\s*=/m.test(table) || /^\s*windows\.sandbox\s*=/m.test(text);
    } catch {
        return false;
    }
}

/** A plain async queue: events pushed from callbacks, pulled by the generator. */
function eventQueue() {
    const items = [];
    let wake = null;
    return {
        push(item) { items.push(item); wake?.(); },
        async *drain(isDone) {
            while (true) {
                while (items.length) yield items.shift();
                if (isDone()) return;
                await new Promise(resolve => { wake = resolve; });
                wake = null;
            }
        },
    };
}

/** Rate-limit windows by length, in the names the stats line already knows. */
const WINDOW_BY_MINUTES = { 300: "five_hour", 10080: "seven_day" };

/** How full the tighter of the plan's windows is, if the snapshot says. */
function limitFrom(snapshot) {
    const windows = [snapshot?.primary, snapshot?.secondary].filter(w => typeof w?.usedPercent === "number");
    if (!windows.length) return null;
    const tightest = windows.reduce((a, b) => (b.usedPercent > a.usedPercent ? b : a));
    return {
        window: WINDOW_BY_MINUTES[tightest.windowDurationMins] ?? `${tightest.windowDurationMins ?? "?"}-minute`,
        utilization: tightest.usedPercent / 100,
    };
}

/** What an approval prompt shows for each kind of request. */
function approvalPrompt(method, params, items) {
    if (method === "item/commandExecution/requestApproval") {
        const command = describeCodexItem({ type: "commandExecution", command: params.command }).detail ?? params.command;
        return {
            toolName: "Codex command",
            title: params.reason ? `Codex wants to run a command: ${params.reason}` : "Codex wants to run a command",
            detail: command || params.reason || undefined,
        };
    }
    if (method === "item/fileChange/requestApproval") {
        const changes = items.get(params.itemId)?.changes ?? [];
        const files = changes.map(c => `${c.kind?.type ?? c.kind ?? "edit"} ${c.path}`).join("\n");
        return {
            toolName: "Codex file change",
            title: params.reason ? `Codex wants to change files: ${params.reason}` : "Codex wants to change files",
            detail: [files, params.grantRoot ? `Write access under ${params.grantRoot}` : ""].filter(Boolean).join("\n") || undefined,
        };
    }
    // item/permissions/requestApproval: wider access for the rest of the turn.
    return {
        toolName: "Codex permissions",
        title: params.reason ? `Codex is asking for more access: ${params.reason}` : "Codex is asking for more access",
        detail: JSON.stringify(params.permissions ?? {}, null, 2),
    };
}

/**
 * The prompt as Codex takes it. Images are handed over by path, which it reads
 * itself; text files are inlined and anything else is named by path.
 */
function turnInput(prompt, attachments) {
    if (!attachments?.length) return [{ type: "text", text: prompt, text_elements: [] }];
    const images = attachments.filter(a => a.kind === "image");
    const { text } = expandAttachments(prompt, attachments.filter(a => a.kind !== "image"), { paths: true });
    return [
        { type: "text", text: text || "See the attached images.", text_elements: [] },
        ...images.map(a => ({ type: "localImage", path: a.path })),
    ];
}

/** One turn: start (or resume) the thread, send the prompt, relay until it completes. */
async function* runTurn({ cli, prompt, attachments, sessionId, model, settings, signal, toolless, requestPermission, trace }) {
    const root = workspaceDir();
    const mode = toolless ? null : resolveMode(settings);
    // Drafting only wants text back: no writes, no commands, nothing kept.
    const policy = toolless
        ? { sandbox: "read-only", approvalPolicy: "never", approvalsReviewer: "user" }
        : MODE_POLICY[mode];

    // Without a Windows sandbox chosen, Codex refuses every command outright,
    // read-only or not, and says so only on stderr. The unelevated one needs
    // no admin prompt and enforces the same policy.
    const args = ["app-server"];
    if (process.platform === "win32" && !configSetsWindowsSandbox()) {
        args.push("-c", 'windows.sandbox="unelevated"');
    }
    const child = spawnCodex(cli, args, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
        // Only the tail matters, and a chatty CLI shouldn't grow this forever.
        stderr = (stderr + data).slice(-4000);
        trace?.({ stderr: data });
    });

    const queue = eventQueue();
    let finished = false;
    let threadId = null;
    let turnId = null;
    // Items by id: a file change's approval names the item, not its files.
    const items = new Map();
    // Items whose text arrived as deltas, so the completed copy isn't added twice.
    const streamed = new Set();
    let lastTextItem = null;
    // Set by turn/completed; the server closing before then is a crash.
    let turnDone = false;
    let usage = { inputTokens: 0, outputTokens: 0 };
    let retryStep = null;

    const emitText = (itemId, text) => {
        if (!text) return;
        // Each message is a paragraph of its own; run together, "I'll check."
        // and the answer became one sentence.
        const fresh = lastTextItem !== null && lastTextItem !== itemId;
        lastTextItem = itemId;
        queue.push({ type: "text", text: fresh ? `\n\n${text}` : text });
    };

    const onNotification = ({ method, params = {} }) => {
        // Another thread's events (a subagent's) don't belong in this answer.
        if (params.threadId && threadId && params.threadId !== threadId) return;
        // Anything after a retry means it went through.
        if (retryStep && method !== "error") {
            queue.push({ type: "step", step: { id: retryStep, status: "done" } });
            retryStep = null;
        }
        switch (method) {
            case "item/agentMessage/delta":
                streamed.add(params.itemId);
                emitText(params.itemId, params.delta);
                return;
            case "item/reasoning/summaryPartAdded":
                // Summary parts are paragraphs; the first needs no break.
                if (params.summaryIndex > 0) queue.push({ type: "reasoning", text: "\n\n" });
                return;
            case "item/reasoning/summaryTextDelta":
            case "item/reasoning/textDelta":
                streamed.add(params.itemId);
                if (params.delta) queue.push({ type: "reasoning", text: params.delta });
                return;
            case "turn/plan/updated":
                if (Array.isArray(params.plan)) {
                    queue.push({
                        type: "plan",
                        items: params.plan.map(p => ({
                            text: String(p.step ?? ""),
                            status: p.status === "inProgress" ? "in_progress" : p.status === "completed" ? "completed" : "pending",
                        })),
                    });
                }
                return;
            case "thread/tokenUsage/updated": {
                const last = params.tokenUsage?.last;
                // Resuming replays the previous turn's figures; only this
                // turn's requests count toward this answer.
                if (!last || !turnId || params.turnId !== turnId) return;
                usage = {
                    inputTokens: usage.inputTokens + (last.inputTokens ?? 0),
                    outputTokens: usage.outputTokens + (last.outputTokens ?? 0),
                };
                queue.push({ type: "stats", stats: usage });
                return;
            }
            case "account/rateLimits/updated": {
                const limit = limitFrom(params.rateLimits);
                if (limit) queue.push({ type: "stats", stats: { limit } });
                return;
            }
            case "model/rerouted":
                if (params.toModel) queue.push({ type: "stats", stats: { model: params.toModel } });
                return;
            case "error": {
                const message = params.error?.message ?? "Codex reported an error.";
                if (params.willRetry) {
                    // Retried by Codex itself; shown so the wait says what it is.
                    const id = `retry-${Date.now()}`;
                    if (retryStep) queue.push({ type: "step", step: { id: retryStep, status: "failed" } });
                    retryStep = id;
                    queue.push({ type: "step", step: { id, kind: "tool", label: "Retrying", detail: message.split("\n")[0].slice(0, 90), status: "running" } });
                } else {
                    queue.push({ type: "error", message });
                }
                return;
            }
            case "item/started":
            case "item/completed": {
                const item = params.item;
                if (!item?.id) return;
                items.set(item.id, item);
                const completed = method === "item/completed";
                if (item.type === "agentMessage") {
                    if (completed && !streamed.has(item.id)) emitText(item.id, item.text?.trim());
                    return;
                }
                if (item.type === "reasoning") {
                    if (completed && !streamed.has(item.id)) {
                        const text = [...(item.summary ?? []), ...(item.summary?.length ? [] : item.content ?? [])].join("\n\n");
                        if (text.trim()) queue.push({ type: "reasoning", text });
                    }
                    return;
                }
                // The user's own message, and the plan text plan mode writes,
                // aren't work.
                if (item.type === "userMessage" || item.type === "plan" || item.type === "hookPrompt") return;
                const failed = item.status === "failed" || item.status === "declined"
                    || (typeof item.exitCode === "number" && item.exitCode !== 0)
                    || Boolean(item.error);
                const output = item.aggregatedOutput
                    ?? item.error?.message
                    ?? item.result?.content?.find?.(c => c?.type === "text")?.text;
                queue.push({
                    type: "step",
                    step: {
                        id: item.id,
                        ...describeCodexItem(item),
                        ...describeCodexInput(item),
                        ...(completed && item.type === "imageView" ? { images: fileImages(item.path) } : {}),
                        status: completed ? (failed ? "failed" : "done") : "running",
                        ...(completed && typeof output === "string" ? { output: clipOutput(output) } : {}),
                        ...(completed && item.status === "declined" && !output ? { output: "Declined." } : {}),
                        ...(completed && typeof item.exitCode === "number" && item.exitCode !== 0 ? { exitCode: item.exitCode } : {}),
                    },
                });
                return;
            }
            case "turn/completed": {
                const turn = params.turn;
                if (turnId && turn?.id && turn.id !== turnId) return;
                if (turn?.status === "failed" && turn.error?.message) {
                    queue.push({ type: "error", message: turn.error.message });
                }
                turnDone = true;
                finished = true;
                queue.push(null);
                return;
            }
            default:
        }
    };

    /**
     * Codex asking. Approvals go to the person at the keyboard; questions
     * and MCP forms have no surface here yet, and are declined rather than
     * left hanging.
     */
    const onRequest = async ({ id, method, params = {} }) => {
        if (method === "item/commandExecution/requestApproval"
            || method === "item/fileChange/requestApproval"
            || method === "item/permissions/requestApproval") {
            let answer = "deny";
            if (requestPermission) {
                try {
                    answer = await requestPermission({ ...approvalPrompt(method, params, items), signal });
                } catch { /* a refusal */ }
            }
            const allowed = answer === "allow" || answer === "allow-chat";
            if (method === "item/permissions/requestApproval") {
                rpc.respond(id, allowed
                    ? { permissions: params.permissions ?? {}, scope: answer === "allow-chat" ? "session" : "turn" }
                    : { permissions: {}, scope: "turn" });
            } else {
                rpc.respond(id, { decision: answer === "allow-chat" ? "acceptForSession" : allowed ? "accept" : "decline" });
            }
            return;
        }
        if (method === "item/tool/requestUserInput") {
            rpc.respond(id, { answers: {} });
            return;
        }
        if (method === "mcpServer/elicitation/request") {
            rpc.respond(id, { action: "decline", content: null, _meta: null });
            return;
        }
        rpc.respondError(id, `${method} is not supported by Volt`);
    };

    const rpc = rpcClient(child, { onNotification, onRequest, trace });
    child.on("close", () => {
        finished = true;
        queue.push(null);
    });

    // Stopping: ask the turn to end, which lets Codex settle its items, and
    // take the whole tree down if it doesn't, commands it started would
    // outlive a plain kill.
    const onAbort = () => {
        if (threadId && turnId) rpc.call("turn/interrupt", { threadId, turnId }).catch(() => {});
        setTimeout(() => killTree(child), 1500).unref?.();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const resumable = typeof sessionId === "string" && /^[\w][\w.-]*$/.test(sessionId);
    const modelId = model && model !== DEFAULT_MODEL ? model : undefined;

    try {
        await initialize(rpc);

        const threadParams = {
            cwd: root,
            ...(modelId ? { model: modelId } : {}),
            approvalPolicy: policy.approvalPolicy,
            approvalsReviewer: policy.approvalsReviewer,
            sandbox: policy.sandbox,
        };
        const opened = resumable
            ? await rpc.call("thread/resume", { threadId: sessionId, excludeTurns: true, ...threadParams })
            : await rpc.call("thread/start", { ...threadParams, ...(toolless ? { ephemeral: true } : {}) });
        threadId = opened?.thread?.id ?? sessionId;
        if (threadId && !toolless) yield { type: "session", sessionId: threadId };
        if (opened?.model) yield { type: "stats", stats: { model: opened.model } };

        const effort = allowedEffort(model, settings?.effort);
        const started = await rpc.call("turn/start", {
            threadId,
            input: turnInput(prompt, attachments),
            cwd: root,
            ...(modelId ? { model: modelId } : {}),
            ...(effort ? { effort } : {}),
            // Some models default to no summary at all; reasoning is what
            // makes a long silence readable.
            summary: "detailed",
            approvalPolicy: policy.approvalPolicy,
            approvalsReviewer: policy.approvalsReviewer,
        });
        turnId = started?.turn?.id ?? null;
        if (signal?.aborted) onAbort();

        for await (const event of queue.drain(() => finished)) {
            if (event) yield event;
        }
        if (!turnDone && !signal?.aborted) throw rpc.closed ?? new Error("Codex stopped before the turn finished.");
    } catch (err) {
        if (!signal?.aborted) {
            // "exited with code 1" says nothing; the reason is on stderr.
            const text = err?.message ?? "Could not run the Codex CLI.";
            const tail = stderr.trim().slice(-400);
            yield { type: "error", message: tail && !text.includes(tail) ? `${text}\n${tail}` : text };
        }
    } finally {
        signal?.removeEventListener("abort", onAbort);
        try { child.stdin.end(); } catch { /* already closed */ }
        killTree(child);
    }

    yield { type: "done", sessionId: toolless ? undefined : (threadId ?? undefined) };
}
