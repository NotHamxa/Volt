import path from "path";
import fs from "fs";
import os from "os";
import { registerProvider } from "./provider.js";
import { claudeAuthMode } from "./cliAuth.js";

/**
 * Claude via the Agent SDK, driving the user's *already installed* claude.exe.
 *
 * The SDK ships its own copy of that binary as a platform optionalDependency
 * (~253 MB). Bundling it would duplicate what the user already has and bloat the
 * installer, so `pathToClaudeCodeExecutable` points at the installed one and the
 * bundled copy is excluded in package.json → build.files.
 *
 * Auth comes from the user's existing Claude CLI login — no API key.
 */

const BIN_NAME = process.platform === "win32" ? "claude.exe" : "claude";

// Common install locations, checked before falling back to PATH.
function candidatePaths() {
    const home = os.homedir();
    return [
        path.join(home, ".local", "bin", BIN_NAME),
        path.join(home, ".claude", "local", BIN_NAME),
        path.join(home, "AppData", "Local", "Programs", "claude", BIN_NAME),
    ];
}

let cachedPath;

export function findClaudeBinary() {
    if (cachedPath !== undefined) return cachedPath;
    for (const candidate of candidatePaths()) {
        try {
            if (fs.existsSync(candidate)) {
                cachedPath = candidate;
                return cachedPath;
            }
        } catch { /* keep looking */ }
    }
    // Fall back to PATH resolution by the SDK itself.
    cachedPath = null;
    return cachedPath;
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

/** Used only if the SDK can't be asked — an offline or broken install. */
const FALLBACK_MODELS = [
    { id: "default", label: "Default (recommended)", controls: effortControl(["low", "medium", "high", "xhigh"]) },
    { id: "sonnet", label: "Sonnet", controls: effortControl(["low", "medium", "high", "xhigh"]) },
    { id: "haiku", label: "Haiku", controls: [] },
];

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
 * The real catalogue, straight from the CLI — which models exist, and which
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
    const bin = findClaudeBinary();
    const idle = (async function* () { await new Promise(() => {}); })();
    const session = query({
        prompt: idle,
        options: bin ? { pathToClaudeCodeExecutable: bin } : {},
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
            controls: effortControl(info.supportsEffort ? info.supportedEffortLevels : []),
        }));
        return modelCache;
    } finally {
        // Both are needed: interrupt ends the turn, return closes the
        // transport. Without them the spawned CLI would linger.
        try { await session.interrupt?.(); } catch { /* already gone */ }
        try { await session.return?.(); } catch { /* already gone */ }
    }
}

export const claudeCodeProvider = registerProvider({
    // The id is persisted in saved chats and prefs — renaming it would
    // orphan every existing conversation. Only the label changed.
    id: "claude-code",
    label: "Claude CLI",
    kind: "subscription-sdk",
    needsKey: false,

    async isAvailable() {
        const bin = findClaudeBinary();
        if (bin) return { available: true, detail: bin };
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

    // Every model carries its own controls, so there is nothing provider-wide.
    controls() {
        return [];
    },

    async *send({ prompt, sessionId, model, settings, signal }) {
        let query;
        try {
            ({ query } = await loadSdk());
        } catch (err) {
            yield { type: "error", message: `Could not load the Claude SDK: ${err?.message ?? err}` };
            return;
        }

        const bin = findClaudeBinary();
        const options = {
            permissionMode: "bypassPermissions",
            // Without this the SDK only emits whole assistant messages, so the
            // answer appears in one lump when the turn finishes.
            includePartialMessages: true,
            ...(bin ? { pathToClaudeCodeExecutable: bin } : {}),
            ...(model ? { model } : {}),
            // Continue an existing thread rather than resending the transcript.
            ...(sessionId ? { resume: sessionId } : {}),
            ...(signal ? { abortController: toController(signal) } : {}),
        };

        // A first-class option, not an env var — it accepts the same levels the
        // model reported as supported.
        if (settings?.effort) options.effort = settings.effort;

        let resolvedSession = sessionId ?? null;
        // Deltas and whole assistant messages both arrive; emitting each token
        // once means the completed message is only a fallback for turns that
        // produced no deltas at all.
        let streamedSinceMessage = false;
        try {
            for await (const message of query({ prompt, options })) {
                if (message?.session_id && !resolvedSession) resolvedSession = message.session_id;

                if (message?.type === "stream_event") {
                    const event = message.event;
                    if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
                        const text = event.delta.text;
                        if (text) {
                            streamedSinceMessage = true;
                            yield { type: "text", text };
                        }
                    }
                    continue;
                }

                if (message?.type === "assistant") {
                    if (streamedSinceMessage) {
                        streamedSinceMessage = false;
                    } else {
                        for (const block of message.message?.content ?? []) {
                            if (block?.type === "text" && block.text) {
                                yield { type: "text", text: block.text };
                            }
                        }
                    }
                }
                // A result message carries the terminal error for a failed turn.
                if (message?.type === "result" && message.is_error) {
                    yield { type: "error", message: String(message.result ?? "The request failed") };
                }
            }
        } catch (err) {
            // A cancelled turn is a normal outcome, not a failure. Trust our own
            // signal rather than the SDK's error shape — it raises a plain
            // "Operation aborted" whose name is not AbortError.
            const aborted = signal?.aborted
                || err?.name === "AbortError"
                || /abort/i.test(err?.message ?? "");
            if (aborted) {
                yield { type: "done", sessionId: resolvedSession ?? undefined };
                return;
            }
            yield { type: "error", message: err?.message ?? String(err) };
            return;
        }

        yield { type: "done", sessionId: resolvedSession ?? undefined };
    },
});

// The SDK takes an AbortController rather than a bare signal.
function toController(signal) {
    const controller = new AbortController();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
    return controller;
}
