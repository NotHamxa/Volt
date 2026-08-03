import path from "path";
import fs from "fs";
import os from "os";
import { registerProvider } from "./provider.js";

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

const MODELS = [
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

const EFFORT = [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
    { id: "xhigh", label: "Extra high" },
];

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
        return MODELS;
    },

    controls() {
        return [
            { id: "effort", label: "Effort", type: "select", options: EFFORT, default: "high" },
        ];
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

        const effort = settings?.effort;
        if (effort) options.env = { ...process.env, CLAUDE_CODE_EFFORT: effort };

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
