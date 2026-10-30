import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { registerProvider, withResumeFallback } from "./provider.js";
import { claudeAuthMode } from "./cliAuth.js";
import { workspaceDir } from "./workspace.js";
import { describeTool, describeToolInput, clipOutput, clipHead, toolResultText, AGENT_TOOLS, PLANNING_TOOLS, QUIET_TOOLS } from "./trace.js";
import { resultImages } from "./stepImages.js";
import { resolveCli, killTree, track } from "./cliProcess.js";
import { expandAttachments } from "./attachments.js";

/**
 * Claude via the Agent SDK, driving the user's *already installed* claude.exe.
 *
 * The SDK ships its own copy of that binary as a platform optionalDependency
 * (~253 MB). Bundling it would duplicate what the user already has and bloat the
 * installer, so `pathToClaudeCodeExecutable` points at the installed one and the
 * bundled copy is excluded in package.json → build.files.
 *
 * Auth comes from the user's existing Claude CLI login, no API key.
 */

const BIN_NAME = process.platform === "win32" ? "claude.exe" : "claude";

// Common install locations, checked before PATH and the npm shim folder.
function candidatePaths() {
    const home = os.homedir();
    return [
        path.join(home, ".local", "bin", BIN_NAME),
        path.join(home, ".claude", "local", BIN_NAME),
        path.join(home, "AppData", "Local", "Programs", "claude", BIN_NAME),
    ];
}

/** `{ path, command, args, env, node? }` for the installed CLI, or null. */
export function findClaudeBinary() {
    return resolveCli("claude", candidatePaths());
}

/**
 * Starts the CLI for the SDK instead of letting it spawn its own.
 *
 * Two reasons. An npm install is a .js entry the SDK runs with bare "node",
 * which needn't be on PATH, the node found beside the shim is used instead.
 * And the SDK's own kill ends only claude.exe: Bash commands it started on the
 * model's behalf carried on after Stop. Here the process id is known, so the
 * SDK's force-kill (and its signal, which fires after its graceful-close
 * window) take the whole tree down.
 */
function spawner(cli, { onStderr, onSpawn } = {}) {
    return (opts) => {
        const command = cli?.node && opts.command === "node" ? cli.node : opts.command;
        const child = track(spawn(command, opts.args, {
            cwd: opts.cwd,
            env: { ...opts.env, ...(cli?.env ?? {}) },
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
        }));
        // Drained whether or not anyone is listening: a full pipe stalls the CLI.
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (data) => onStderr?.(data));
        onSpawn?.(child);
        opts.signal?.addEventListener("abort", () => killTree(child), { once: true });

        return {
            stdin: child.stdin,
            stdout: child.stdout,
            get killed() { return child.killed; },
            get exitCode() { return child.exitCode; },
            get signalCode() { return child.signalCode; },
            kill: () => { killTree(child); return true; },
            on: (event, listener) => child.on(event, listener),
            once: (event, listener) => child.once(event, listener),
            off: (event, listener) => child.off(event, listener),
        };
    };
}

// Imported lazily: loading the SDK costs time, and the provider list is built
// on startup where most users won't have opened the AI window yet.
let sdk = null;
async function loadSdk() {
    if (!sdk) sdk = await import("@anthropic-ai/claude-agent-sdk");
    return sdk;
}

const EFFORT_LABELS = {
    low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max",
};

/**
 * How much Claude may do without asking, chosen per conversation from the
 * composer, and remembered as the default for the next one. permissionGate
 * below is what enforces it, the CLI's own mode is set to match, but never
 * trusted on its own.
 */
const MODE_CONTROL = {
    id: "mode",
    label: "Mode",
    type: "select",
    sticky: true,
    options: [
        { id: "ask", label: "Ask first", detail: "Approve each command, file change and fetch" },
        { id: "edits", label: "Auto-edit", detail: "Edits inside the workspace go ahead; commands still ask" },
        { id: "auto", label: "Auto", detail: "A classifier approves routine actions; asks about the rest" },
        { id: "plan", label: "Plan", detail: "Reads and plans only, then asks before starting" },
        { id: "full", label: "Full access", detail: "Runs anything without asking", danger: true },
    ],
    default: "ask",
};
const MODES = new Set(MODE_CONTROL.options.map(o => o.id));

/** Used only if the SDK can't be asked, an offline or broken install. */
const FALLBACK_MODELS = [
    { id: "default", label: "Default (recommended)", controls: [...effortControl(["low", "medium", "high", "xhigh"]), MODE_CONTROL] },
    { id: "sonnet", label: "Sonnet", controls: [...effortControl(["low", "medium", "high", "xhigh"]), MODE_CONTROL] },
    { id: "haiku", label: "Haiku", controls: [MODE_CONTROL] },
];
// A stand-in, not the CLI's own list: the saved catalogue ignores it.
FALLBACK_MODELS.fallback = true;

function effortControl(levels) {
    if (!levels?.length) return [];
    return [{
        id: "effort",
        label: "Effort",
        type: "select",
        options: levels.map(level => ({ id: level, label: EFFORT_LABELS[level] ?? level })),
        // "high" where offered, otherwise the strongest the model allows.
        default: levels.includes("high") ? "high" : levels[levels.length - 1],
    }];
}

/**
 * The real catalogue, straight from the CLI, which models exist, and which
 * effort levels each one actually accepts. Hard-coding this was wrong in a way
 * that showed: Haiku supports no effort at all, so offering the control there
 * was offering a knob that does nothing.
 *
 * supportedModels() lives on a live session, so a short-lived one is opened
 * with a prompt iterable that never yields, then torn down. Cached for the
 * process lifetime because that costs a CLI spawn.
 */
let modelCache = null;

async function fetchModels() {
    if (modelCache) return modelCache;

    const { query } = await loadSdk();
    const cli = findClaudeBinary();
    const idle = (async function* () { await new Promise(() => {}); })();
    const session = query({
        prompt: idle,
        options: cli
            ? { pathToClaudeCodeExecutable: cli.path, spawnClaudeCodeProcess: spawner(cli) }
            : {},
    });

    try {
        const infos = await Promise.race([
            session.supportedModels(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("timed out")), 15000).unref?.()),
        ]);
        modelCache = infos.map(info => ({
            id: info.value,
            label: info.displayName ?? info.value,
            // The CLI advertises aliases, "Opus", "Sonnet", which say nothing
            // about which version they currently point at. resolvedModel is the
            // wire id behind the alias, so it answers that without this having
            // to guess at version numbers that would go stale.
            detail: info.resolvedModel && info.resolvedModel !== info.value
                ? info.resolvedModel
                : undefined,
            controls: [...effortControl(info.supportsEffort ? info.supportedEffortLevels : []), MODE_CONTROL],
        }));
        return modelCache;
    } finally {
        // Both are needed: interrupt ends the turn, return closes the
        // transport. Without them the spawned CLI would linger.
        try { await session.interrupt?.(); } catch { /* already gone */ }
        try { await session.return?.(); } catch { /* already gone */ }
    }
}

// --- permissions ----------------------------------------------------------

/**
 * Tools that only look. Auto-allowed while they stay inside the working
 * folder; reading anywhere else still asks, since a file's contents can leave
 * through the answer.
 */
const READ_ONLY = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead"]);
// Claude's own bookkeeping, its plan, its tool index. Touches nothing on
// disk or the network. Newer CLIs plan with TaskCreate/TaskUpdate rather than
// TodoWrite, and every one of those used to stop and ask.
const INERT = QUIET_TOOLS;

/** Symlinks resolved where the target exists, so a link can't lead outside. */
function realish(p) {
    try {
        return fs.realpathSync.native(p);
    } catch {
        return p;
    }
}

function inside(root, target) {
    // Omitted means the tool's default, which is the working folder.
    if (target === undefined || target === null || target === "") return true;
    if (typeof target !== "string") return false;
    const rel = path.relative(realish(root), realish(path.resolve(root, target)));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function readStaysInside(toolName, input, root) {
    const paths = [input?.file_path, input?.notebook_path, input?.path];
    if (!paths.every(p => inside(root, p))) return false;
    // A glob pattern can carry its own root: "C:/Users/**/*.env".
    if (toolName === "Glob") {
        const pattern = String(input?.pattern ?? "");
        if (path.isAbsolute(pattern) || /(^|[\\/])\.\.([\\/]|$)/.test(pattern)) return false;
    }
    return true;
}

/** What the approval prompt shows, the full command, not a one-line summary. */
function toolDetail(input = {}) {
    const primary = input.command ?? input.url ?? input.file_path ?? input.notebook_path
        ?? input.query ?? input.path ?? input.pattern;
    const text = typeof primary === "string" ? primary : JSON.stringify(input, null, 2);
    return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
}

const allow = (input) => ({ behavior: "allow", updatedInput: input });
const deny = (message) => ({ behavior: "deny", message });

/**
 * Anything that can change the machine or reach the network, Bash, Write,
 * Edit, WebFetch, MCP tools, waits for the person at the keyboard. A chat
 * turn can carry pasted text or fetched pages written by someone else, and
 * running with permissions bypassed let that text run commands anywhere on
 * disk.
 */
// Tools that only change files. In Auto-edit they go ahead inside the
// workspace; anywhere else they still ask.
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

function editStaysInside(input, root) {
    const target = input?.file_path ?? input?.notebook_path;
    return typeof target === "string" && target !== "" && inside(root, target);
}

/** Reading a file the user attached is what attaching it asked for. */
function readsAttached(toolName, input, attached) {
    if (toolName !== "Read" || typeof input?.file_path !== "string") return false;
    return attached.has(pathKey(input.file_path));
}

const pathKey = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));

function permissionGate(root, requestPermission, mode, attached) {
    return async (toolName, input, { signal, title, blockedPath }) => {
        if (INERT.has(toolName)) return allow(input);
        if (READ_ONLY.has(toolName) && !blockedPath && readStaysInside(toolName, input, root)) {
            return allow(input);
        }
        if (readsAttached(toolName, input, attached)) return allow(input);
        if (mode === "edits" && EDIT_TOOLS.has(toolName) && !blockedPath && editStaysInside(input, root)) {
            return allow(input);
        }
        if (!requestPermission) return deny("No one was available to approve this.");
        // Leaving plan mode is the moment to review the plan, so it is asked
        // as that question, with the plan itself as the thing approved.
        const planning = toolName === "ExitPlanMode";
        try {
            const answer = await requestPermission({
                toolName,
                title: planning ? "Claude has a plan. Start working on it?" : title || `Claude wants to use ${toolName}`,
                detail: planning && typeof input?.plan === "string" ? input.plan : toolDetail(input),
                signal,
            });
            if (answer === "allow" || answer === "allow-chat") return allow(input);
        } catch { /* treated as a refusal */ }
        return deny("The user declined this action.");
    };
}

function permissionOptions({ toolless, root, requestPermission, mode, attached }) {
    if (toolless) {
        return {
            // No tools at all, not merely none approved, so nothing the
            // model writes can act on the machine. User settings (hooks, MCP
            // servers) stay unloaded for the same reason.
            tools: [],
            mcpServers: {},
            strictMcpConfig: true,
            settingSources: [],
            permissionMode: "dontAsk",
            persistSession: false,
        };
    }
    // Chosen deliberately, per conversation, and marked as dangerous where
    // it is picked.
    if (mode === "full") {
        return { permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true };
    }
    // Stated explicitly: the user's own CLI settings may default to a mode
    // that approves on its own ("auto", "bypassPermissions").
    // In Auto the CLI's classifier decides first; whatever it won't approve
    // on its own still comes through the gate, and so to the user.
    const permissionMode = { plan: "plan", edits: "acceptEdits", auto: "auto" }[mode] ?? "default";
    return { permissionMode, canUseTool: permissionGate(root, requestPermission, mode, attached) };
}

/**
 * The conversation's mode. A chat saved before modes existed has none, and
 * the composer shows those as Ask first, so that is what they get, rather
 * than something the picker doesn't say. Anything unrecognised is the same.
 */
function resolveMode(settings) {
    return MODES.has(settings?.mode) ? settings.mode : "ask";
}

// --- plan ------------------------------------------------------------------

/**
 * Claude's plan, rebuilt from the tools it keeps it with. TodoWrite sends the
 * whole list every time; the Task tools add and update one entry at a time,
 * and a new task's id only arrives with its result.
 */
function planTracker() {
    const tasks = new Map();
    const creating = new Map();
    let todos = null;
    return {
        /** True when the plan changed. */
        onCall(name, callId, input) {
            if (name === "TodoWrite" && Array.isArray(input?.todos)) {
                todos = input.todos.map(t => ({ text: String(t.content ?? ""), status: t.status, active: t.activeForm }));
                return true;
            }
            if (name === "TaskCreate") {
                creating.set(callId, input ?? {});
                return false;
            }
            const task = name === "TaskUpdate" && tasks.get(String(input?.taskId));
            if (!task) return false;
            if (input.status) task.status = input.status;
            if (input.subject) task.text = String(input.subject);
            if (input.activeForm) task.active = String(input.activeForm);
            return true;
        },
        onResult(callId, result) {
            const input = creating.get(callId);
            creating.delete(callId);
            const id = result?.task?.id;
            if (!input || !id) return false;
            tasks.set(String(id), {
                text: String(result.task.subject ?? input.subject ?? ""),
                status: "pending",
                active: input.activeForm,
            });
            return true;
        },
        get items() {
            return todos ?? [...tasks.values()].filter(t => t.status !== "deleted");
        },
    };
}

// --- provider --------------------------------------------------------------

export const claudeCodeProvider = registerProvider({
    // The id is persisted in saved chats and prefs, renaming it would
    // orphan every existing conversation. Only the label changed.
    id: "claude-code",
    label: "Claude CLI",
    kind: "subscription-sdk",
    needsKey: false,

    async isAvailable() {
        const cli = findClaudeBinary();
        if (cli) return { available: true, detail: cli.path };
        return {
            available: false,
            detail: "Claude CLI not found. Install it, then re-check.",
        };
    },

    async models() {
        try {
            return await fetchModels();
        } catch (err) {
            console.warn("Could not read the Claude model list:", err?.message ?? err);
            return FALLBACK_MODELS;
        }
    },

    billing() {
        return claudeAuthMode();
    },

    // Effort differs per model and comes with the catalogue; the mode applies
    // to all of them, so it's offered before the catalogue has been read,
    // the CLI takes a few seconds to answer, and the picker used to be
    // missing until it did.
    controls() {
        return [MODE_CONTROL];
    },

    async *send({ prompt, attachments, sessionId, history, model, settings, signal, toolless, requestPermission, trace }) {
        let query;
        try {
            ({ query } = await loadSdk());
        } catch (err) {
            yield { type: "error", message: `Could not load the Claude SDK: ${err?.message ?? err}` };
            yield { type: "done" };
            return;
        }

        const cli = findClaudeBinary();
        if (!cli) {
            yield { type: "error", message: "Claude CLI not found." };
            yield { type: "done" };
            return;
        }

        const run = (turn) => runTurn({
            query, cli, ...turn, attachments, model, settings, signal, toolless, requestPermission, trace,
        });
        // A one-shot completion has no thread to resume or transcript to replay.
        if (toolless) yield* run({ sessionId: null, prompt });
        else yield* withResumeFallback({ sessionId, prompt, history, run });
    },
});

/**
 * Whether a model takes adaptive thinking. The ones that accept an effort
 * level are the ones that think adaptively; until the catalogue has been
 * read, only Haiku is assumed not to.
 */
function thinksAdaptively(model) {
    const entry = modelCache?.find(m => m.id === (model || "default"));
    if (entry) return entry.controls.some(c => c.id === "effort");
    return !/haiku/i.test(model ?? "");
}

/** One query() against the CLI. */
async function* runTurn({ query, cli, prompt, attachments, sessionId, model, settings, signal, toolless, requestPermission, trace }) {
    const root = workspaceDir();
    const attached = new Set((attachments ?? []).map(a => pathKey(a.path)));

    // The CLI's stderr, which the SDK can't see once it isn't the one
    // spawning: a failed resume explains itself only there.
    let stderr = "";
    let stderrClosed = Promise.resolve();

    const options = {
        // Explicit, or the session would run wherever the app was launched.
        cwd: root,
        // Without this the SDK only emits whole assistant messages, so the
        // answer appears in one lump when the turn finishes.
        includePartialMessages: true,
        pathToClaudeCodeExecutable: cli.path,
        spawnClaudeCodeProcess: spawner(cli, {
            onStderr: (data) => {
                stderr = (stderr + data).slice(-4000);
                trace?.({ stderr: data });
            },
            onSpawn: (child) => {
                stderrClosed = new Promise(resolve => child.stderr.once("close", resolve));
            },
        }),
        ...(model ? { model } : {}),
        // Continue an existing thread rather than resending the transcript.
        ...(sessionId ? { resume: sessionId } : {}),
        ...(signal ? { abortController: toController(signal) } : {}),
        ...permissionOptions({ toolless, root, requestPermission, mode: resolveMode(settings), attached }),
    };

    // A first-class option, not an env var, it accepts the same levels the
    // model reported as supported.
    if (settings?.effort) options.effort = settings.effort;

    // Recent models think with their display "omitted": the blocks arrive,
    // but empty, so a long pause had nothing behind it. Summaries are asked
    // for explicitly, on the models that think adaptively, and through the
    // CLI's own setting for the rest.
    if (!toolless) {
        options.settings = { showThinkingSummaries: true };
        if (thinksAdaptively(model)) options.thinking = { type: "adaptive", display: "summarized" };
    }

    let resolvedSession = sessionId ?? null;
    // Deltas and whole assistant messages both arrive; emitting each token
    // once means the completed message is only a fallback for turns that
    // produced no deltas at all.
    let streamedSinceMessage = false;
    // Tool names by call id, so a result can be matched to what produced it.
    const tools = new Map();
    // The retry step in progress, settled by whatever arrives next.
    let retrying = null;
    const plan = planTracker();
    // Tokens so far, so the view can count up while the turn runs: calls
    // already finished, plus the one streaming now. Each result's totals
    // replace these as it arrives.
    let spent = { inputTokens: 0, outputTokens: 0 };
    let call = { inputTokens: 0, outputTokens: 0 };
    // A turn that waits on background agents gets a result every time it
    // wakes up to read one. Each covers only its own stretch, so they add up.
    const settled = { inputTokens: 0, outputTokens: 0, turns: 0 };
    // Text after a wake-up is a new paragraph, not the end of the last one.
    let newParagraph = false;
    const paragraph = (text) => {
        if (!newParagraph) return text;
        newParagraph = false;
        return /^\s*\n/.test(text) ? text : `\n\n${text}`;
    };
    // Agents sent to work in the background, by the call that started them.
    // Their call returns at once; they're done when a notification says so.
    const backgroundAgents = new Set();
    try {
        for await (const message of query({ prompt: promptInput(prompt, attachments), options })) {
            if (message?.session_id && !resolvedSession) {
                resolvedSession = message.session_id;
                yield { type: "session", sessionId: resolvedSession };
            }

            // Anything after a retry means the retry went through.
            if (retrying && message?.type !== "system") {
                yield { type: "step", step: { id: retrying, status: "done" } };
                retrying = null;
            }

            if (message?.type === "stream_event") {
                const event = message.event;
                // A subagent's own words are its report to Claude, not the
                // answer; its tool calls still show, under the call that
                // started it.
                const sub = Boolean(message.parent_tool_use_id);
                // Each model call opens with what it read and closes with
                // what it wrote. A subagent's calls are left out, as they are
                // from the result's totals, so the count never jumps back.
                if (!sub && event?.type === "message_start") {
                    spent.inputTokens += call.inputTokens;
                    spent.outputTokens += call.outputTokens;
                    const usage = event.message?.usage ?? {};
                    call = {
                        inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
                        outputTokens: usage.output_tokens ?? 0,
                    };
                    yield { type: "stats", stats: { inputTokens: spent.inputTokens + call.inputTokens, outputTokens: spent.outputTokens + call.outputTokens } };
                    continue;
                }
                if (!sub && event?.type === "message_delta" && typeof event.usage?.output_tokens === "number") {
                    call.outputTokens = event.usage.output_tokens;
                    yield { type: "stats", stats: { inputTokens: spent.inputTokens + call.inputTokens, outputTokens: spent.outputTokens + call.outputTokens } };
                    continue;
                }
                // Extended thinking arrives on the same channel as the
                // answer, just under a different delta type. It is reported
                // rather than dropped so a long pause has something behind
                // it, but it never joins the transcript.
                if (sub && event?.type === "content_block_delta") continue;
                if (event?.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
                    const text = event.delta.thinking;
                    if (text) yield { type: "reasoning", text };
                    continue;
                }
                if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
                    const text = event.delta.text;
                    if (text) {
                        streamedSinceMessage = true;
                        yield { type: "text", text: paragraph(text) };
                    }
                    continue;
                }
                // A tool call announces itself before its arguments have
                // finished streaming. Shown now, it fills the gap while a
                // long command or file is still being written out; the
                // completed message fills in what it acts on.
                if (event?.type === "content_block_start" && event.content_block?.type === "tool_use") {
                    const { id, name } = event.content_block;
                    tools.set(id, name);
                    if (!QUIET_TOOLS.has(name)) {
                        yield { type: "step", step: { id, parentId: message.parent_tool_use_id ?? undefined, status: "running", ...describeTool(name) } };
                    }
                }
                continue;
            }

            // Deltas are too many to be worth keeping; everything else is
            // what the trace log is for.
            trace?.(message);

            if (message?.type === "system" && message.subtype === "init" && message.model) {
                yield { type: "stats", stats: { model: message.model } };
                continue;
            }

            // An overloaded or failing API is retried by the CLI, sometimes
            // for minutes. Shown as a step, that wait says what it is.
            if (message?.type === "system" && message.subtype === "api_retry") {
                const id = `retry-${message.attempt}`;
                if (retrying && retrying !== id) yield { type: "step", step: { id: retrying, status: "failed" } };
                retrying = id;
                yield {
                    type: "step",
                    step: {
                        id,
                        kind: "tool",
                        label: "Retrying",
                        detail: `attempt ${message.attempt} of ${message.max_retries}${message.error_status ? ` · API error ${message.error_status}` : ""}`,
                        status: "running",
                    },
                };
                continue;
            }

            // A long conversation is summarised to fit; the step explains the pause.
            if (message?.type === "system" && message.subtype === "compact_boundary") {
                const meta = message.compact_metadata ?? {};
                yield {
                    type: "step",
                    step: {
                        id: `compact-${message.uuid ?? Date.now()}`,
                        kind: "tool",
                        label: "Compacted the conversation",
                        detail: meta.trigger === "auto" ? "automatically" : undefined,
                        status: "done",
                    },
                };
                continue;
            }

            // A subagent's running tally, so its card can say how far along it is.
            if (message?.type === "system" && message.subtype === "task_progress" && AGENT_TOOLS.has(tools.get(message.tool_use_id))) {
                const usage = message.usage ?? {};
                yield {
                    type: "step",
                    step: {
                        id: message.tool_use_id,
                        ...(typeof usage.total_tokens === "number" ? { tokens: usage.total_tokens } : {}),
                        ...(typeof usage.tool_uses === "number" ? { toolUses: usage.tool_uses } : {}),
                    },
                };
                continue;
            }

            // A background agent finishing. Until this arrives its call has
            // only said it started, and the agent is still at work.
            if (message?.type === "system" && message.subtype === "task_notification" && backgroundAgents.has(message.tool_use_id)) {
                backgroundAgents.delete(message.tool_use_id);
                const status = message.status === "completed" ? "done" : message.status === "failed" ? "failed" : "stopped";
                yield { type: "step", step: { id: message.tool_use_id, status } };
                continue;
            }

            // How much of the plan's rolling window is spent, the number a
            // subscription user actually runs out of.
            if (message?.type === "rate_limit_event") {
                const info = message.rate_limit_info;
                const window = info?.unifiedWindows?.[info?.rateLimitType];
                if (typeof window?.utilization === "number") {
                    yield { type: "stats", stats: { limit: { window: info.rateLimitType, utilization: window.utilization } } };
                }
                continue;
            }

            if (message?.type === "assistant") {
                for (const block of message.message?.content ?? []) {
                    if (block?.type !== "tool_use") continue;
                    tools.set(block.id, block.name);
                    if (PLANNING_TOOLS.has(block.name)) {
                        if (plan.onCall(block.name, block.id, block.input)) yield { type: "plan", items: plan.items };
                        continue;
                    }
                    if (QUIET_TOOLS.has(block.name)) continue;
                    yield {
                        type: "step",
                        step: {
                            id: block.id,
                            parentId: message.parent_tool_use_id ?? undefined,
                            ...describeTool(block.name, block.input),
                            ...describeToolInput(block.name, block.input),
                        },
                    };
                }
                if (message.parent_tool_use_id) {
                    // A subagent's text is never the answer; it is the
                    // agent's own account, shown when you open it.
                    for (const block of message.message?.content ?? []) {
                        if (block?.type === "text" && block.text?.trim()) {
                            yield { type: "agent-text", agentId: message.parent_tool_use_id, text: block.text };
                        }
                    }
                } else if (streamedSinceMessage) {
                    streamedSinceMessage = false;
                } else {
                    for (const block of message.message?.content ?? []) {
                        if (block?.type === "text" && block.text) {
                            yield { type: "text", text: paragraph(block.text) };
                        }
                    }
                }
                continue;
            }

            // Tool results come back as a user turn, one block per call.
            if (message?.type === "user" && Array.isArray(message.message?.content)) {
                const results = message.message.content.filter(b => b?.type === "tool_result");
                for (const block of results) {
                    const name = tools.get(block.tool_use_id);
                    if (PLANNING_TOOLS.has(name)) {
                        // The structured result belongs to the message, so it
                        // only says which call it answers when there is one.
                        const structured = results.length === 1 ? message.tool_use_result : null;
                        if (plan.onResult(block.tool_use_id, structured)) yield { type: "plan", items: plan.items };
                        continue;
                    }
                    if (QUIET_TOOLS.has(name)) continue;
                    // A picture it read is shown as the picture, not "[image]".
                    const images = resultImages(block.content);
                    const text = toolResultText(block.content, { imagePlaceholder: !images.length });
                    // A background agent's call returns as soon as it starts.
                    // That receipt isn't its result, and it isn't done.
                    if (AGENT_TOOLS.has(name) && !block.is_error && /^Async agent launched/.test(text)) {
                        backgroundAgents.add(block.tool_use_id);
                        continue;
                    }
                    yield {
                        type: "step",
                        step: {
                            id: block.tool_use_id,
                            status: block.is_error ? "failed" : "done",
                            // A file reads from the top; a command ends at the bottom.
                            output: name === "Read" ? clipHead(text) : clipOutput(text),
                            ...(images.length ? { images } : {}),
                        },
                    };
                }
                continue;
            }

            if (message?.type === "result") {
                const usage = message.usage ?? {};
                // Everything the model read, cached or not, the cache only
                // changes what it cost.
                settled.inputTokens += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
                settled.outputTokens += usage.output_tokens ?? 0;
                settled.turns += message.num_turns ?? 0;
                spent = { inputTokens: settled.inputTokens, outputTokens: settled.outputTokens };
                call = { inputTokens: 0, outputTokens: 0 };
                newParagraph = true;
                yield {
                    type: "stats",
                    stats: {
                        // No duration: ai.ipc times every provider the same way.
                        turns: settled.turns,
                        inputTokens: settled.inputTokens,
                        outputTokens: settled.outputTokens,
                        // Already a running total across wake-ups.
                        costUsd: message.total_cost_usd,
                    },
                };
                // A result message carries the terminal error for a failed
                // turn. Error results have `errors` and no `result` at all,
                // which is why every failure used to read as the same line.
                if (message.is_error) {
                    const detail = Array.isArray(message.errors) && message.errors.length
                        ? message.errors.join("\n")
                        : message.result;
                    yield { type: "error", message: String(detail || `The request failed (${message.subtype ?? "error"}).`) };
                }
            }
        }
    } catch (err) {
        // A cancelled turn is a normal outcome, not a failure. Trust our own
        // signal rather than the SDK's error shape, it raises a plain
        // "Operation aborted" whose name is not AbortError.
        const aborted = signal?.aborted
            || err?.name === "AbortError"
            || /abort/i.test(err?.message ?? "");
        if (aborted) {
            yield { type: "done", sessionId: resolvedSession ?? undefined };
            return;
        }
        // "exited with code 1" says nothing; the reason is on stderr, which
        // may still be draining when the exit is reported.
        await Promise.race([stderrClosed, new Promise(resolve => setTimeout(resolve, 1000))]);
        const text = err?.message ?? String(err);
        const tail = stderr.trim().slice(-400);
        yield { type: "error", message: tail && !text.includes(tail) ? `${text}\n${tail}` : text };
        yield { type: "done", sessionId: resolvedSession ?? undefined };
        return;
    }

    yield { type: "done", sessionId: resolvedSession ?? undefined };
}

/**
 * The prompt as the SDK takes it. Images go as content blocks, which only a
 * streamed user message can carry; text files are inlined and anything else is
 * named by path for Claude to read, the gate lets it, without asking.
 */
function promptInput(prompt, attachments) {
    if (!attachments?.length) return prompt;
    const { text, images } = expandAttachments(prompt, attachments, { images: true, paths: true });
    if (!images.length) return text;
    const content = [
        ...images.map(i => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.data } })),
        { type: "text", text },
    ];
    return (async function* () {
        yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null };
    })();
}

// The SDK takes an AbortController rather than a bare signal.
function toController(signal) {
    const controller = new AbortController();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
    return controller;
}
