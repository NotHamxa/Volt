/**
 * The contract every AI backend implements.
 *
 * Three kinds sit behind it:
 *   - "subscription-sdk"  an official SDK driving a CLI the user already has
 *                         (Claude via claude.exe) — no API key
 *   - "subscription-cli"  a binary spawned directly (codex, ollama) — no API key
 *   - "api"               an API key the user supplies, for wider provider choice
 *
 * `controls()` exists because the knobs are not universal: Claude has effort,
 * the OpenAI-compatible providers have others, Ollama has none. The prompt bar
 * renders what the adapter declares rather than a fixed set, so no provider
 * shows a control it will silently ignore.
 *
 * Controls can also vary *within* a provider — Claude's Haiku accepts no effort
 * level while Opus accepts five — so a model may carry its own list. When it
 * does, that wins over the provider-wide one.
 *
 * `done.sessionId` is three-state: a string replaces the stored thread id,
 * null clears it (the thread is gone), and undefined leaves it alone.
 *
 * @typedef {{ type: "text", text: string }
 *          | { type: "error", message: string }
 *          | { type: "done", sessionId?: string | null }} Chunk
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: "subscription-sdk" | "subscription-cli" | "api",
 *   needsKey: boolean,
 *   isAvailable: () => Promise<{ available: boolean, detail?: string }>,
 *   models: () => Promise<Array<{ id: string, label: string, detail?: string, controls?: AiControl[] }>>,
 *   controls: () => Array<{ id: string, label: string, type: "select", options: Array<{ id: string, label: string }>, default: string }>,
 *   billing?: () => { mode: "subscription" | "api-key" | "unknown", label: string },
 *   send: (opts: {
 *     prompt: string, sessionId?: string|null, history?: Array<{ role: string, content: string }>,
 *     model?: string, settings?: Record<string,string>, signal?: AbortSignal,
 *     toolless?: boolean,
 *     requestPermission?: (req: { toolName: string, title: string, detail?: string, signal?: AbortSignal }) => Promise<"allow" | "allow-chat" | "deny">,
 *   }) => AsyncIterable<Chunk>,
 * }} AiProvider
 *
 * `toolless` asks for a pure completion — no tools, no session — for callers
 * like command drafting that only want text back.
 */

import Store from "electron-store";

const registry = new Map();

export function registerProvider(provider) {
    registry.set(provider.id, provider);
    return provider;
}

export function getProvider(id) {
    return registry.get(id) ?? null;
}

export function allProviders() {
    return [...registry.values()];
}

/**
 * Provider list for the UI. Availability is probed per provider and failures are
 * reported rather than thrown — one missing CLI must not blank the whole list.
 */
export async function describeProviders() {
    const described = await Promise.all(allProviders().map(async (p) => {
        let availability = { available: false, detail: "Unknown" };
        try {
            availability = await p.isAvailable();
        } catch (err) {
            availability = { available: false, detail: err?.message ?? "Check failed" };
        }
        // Optional: CLI providers report whether they bill a plan or a key.
        let billing = null;
        try {
            billing = p.billing?.() ?? null;
        } catch { /* a provider that can't tell us simply doesn't */ }

        return {
            id: p.id,
            label: p.label,
            kind: p.kind,
            needsKey: p.needsKey,
            billing,
            available: availability.available,
            detail: availability.detail ?? null,
            // Deliberately empty. Reading a catalogue costs a CLI spawn —
            // measured at two seconds for the set of providers registered here
            // — and the view blocked on all of them before it could paint.
            // Callers ask for the one provider they're using, via providerModels.
            models: [],
            controls: p.controls(),
        };
    }));
    return described;
}

/**
 * Stateless providers resend the transcript every turn, so a long chat grew
 * every request without limit until the vendor rejected it. Characters stand
 * in for tokens (roughly four to one): this keeps a turn near 50k tokens, well
 * inside every context window offered here, without a tokenizer per vendor.
 */
export const HISTORY_BUDGET_CHARS = 200_000;

/**
 * The newest turns that fit the budget. The last message — the prompt being
 * asked — is always kept, and the result never opens on an assistant turn,
 * which some APIs (Gemini) reject.
 */
export function trimHistory(messages, budget = HISTORY_BUDGET_CHARS) {
    const list = messages ?? [];
    if (!list.length) return [];
    let used = list[list.length - 1].content?.length ?? 0;
    let start = list.length - 1;
    while (start > 0) {
        const size = list[start - 1].content?.length ?? 0;
        if (used + size > budget) break;
        used += size;
        start--;
    }
    const kept = list.slice(start);
    while (kept.length > 1 && kept[0].role !== "user") kept.shift();
    return kept;
}

/** The stored transcript minus the prompt being asked now, if it is the tail. */
export function priorTurns(history, prompt) {
    const turns = (history ?? []).filter(m => m.content?.trim());
    const last = turns.at(-1);
    if (last?.role === "user" && last.content === prompt) turns.pop();
    return turns;
}

/**
 * A session-based CLI starting a thread partway through a conversation — the
 * chat began on another provider, or its old session is gone — would otherwise
 * answer with no idea what came before. The earlier turns ride along in the
 * prompt instead.
 */
export function withReplayedContext(prompt, history, budget = HISTORY_BUDGET_CHARS / 2) {
    const prior = priorTurns(history, prompt);
    if (!prior.length) return prompt;
    const kept = trimHistory([...prior, { role: "user", content: "" }], budget).slice(0, -1);
    if (!kept.length) return prompt;
    const transcript = kept
        .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
        .join("\n\n");
    return [
        "Earlier in this conversation (continued from before this session started):",
        "<transcript>",
        transcript,
        "</transcript>",
        "",
        prompt,
    ].join("\n");
}

// How the CLIs report a thread id they no longer have.
const STALE_SESSION = /no conversation found|(?:session|thread|conversation|rollout)\b[^\n]{0,60}\bnot found|no (?:session|thread|rollout)s?\b[^\n]{0,30}\bfound/i;

/**
 * Runs a turn against a stored thread, and recovers when that thread is gone.
 *
 * A dead session id used to break a chat for good: every later turn resumed
 * it, failed, and wrote the same id back. When the CLI says the thread doesn't
 * exist — before anything was produced — the turn runs once more from scratch
 * with the transcript replayed, and the new thread id replaces the old one.
 *
 * `run({ sessionId, prompt })` is the adapter's own single attempt.
 */
export async function* withResumeFallback({ sessionId, prompt, history, run }) {
    if (!sessionId) {
        yield* run({ sessionId: null, prompt: withReplayedContext(prompt, history) });
        return;
    }

    // Errors are held until something else arrives, so a stale-session
    // failure can be swallowed rather than flashed at the reader.
    const held = [];
    let produced = false;
    for await (const chunk of run({ sessionId, prompt })) {
        if (!produced && chunk.type === "error") { held.push(chunk); continue; }
        if (!produced && chunk.type === "done" && held.some(c => STALE_SESSION.test(c.message ?? ""))) {
            for await (const retry of run({ sessionId: null, prompt: withReplayedContext(prompt, history) })) {
                // null rather than undefined, so a retry that also fails still
                // clears the dead id instead of leaving it to fail again.
                yield retry.type === "done" ? { ...retry, sessionId: retry.sessionId ?? null } : retry;
            }
            return;
        }
        if (chunk.type !== "done") produced = true;
        yield* held.splice(0);
        yield chunk;
    }
    yield* held.splice(0);
}

/**
 * One provider's models. Slow the first time (a CLI spawn or an HTTP round
 * trip) and cached by the adapter afterwards, so this is only ever paid for a
 * provider actually being looked at.
 */
export async function providerModels(id) {
    const provider = getProvider(id);
    if (!provider) return [];
    const live = refreshModels(provider);
    // Last launch's catalogue answers at once while this launch's is read;
    // the CLI providers take seconds to say what they offer, and until they
    // did the composer had no effort menu to show.
    const saved = savedCatalogue(id);
    return saved ?? await live;
}

// --- the catalogue, kept between launches ------------------------------------

const CATALOGUE_KEY = "aiModelCatalogue";
let _store = null;
const store = () => (_store ??= new Store());

function savedCatalogue(id) {
    try {
        const models = store().get(CATALOGUE_KEY)?.[id]?.models;
        return Array.isArray(models) && models.length ? models : null;
    } catch {
        return null;
    }
}

/** One read per provider at a time; the saved copy is replaced when it lands. */
const refreshing = new Map();
function refreshModels(provider) {
    if (!refreshing.has(provider.id)) {
        const request = Promise.resolve()
            .then(() => provider.models())
            .then(models => {
                // A stand-in list (the CLI couldn't be asked) is never saved
                // over a real one.
                if (Array.isArray(models) && models.length && !models.fallback) {
                    try {
                        store().set(`${CATALOGUE_KEY}.${provider.id}`, { savedAt: Date.now(), models });
                    } catch { /* unsaved: read again next launch */ }
                }
                return models;
            })
            .catch(err => {
                console.warn(`Could not read models for ${provider.id}:`, err?.message ?? err);
                return [];
            })
            .finally(() => refreshing.delete(provider.id));
        refreshing.set(provider.id, request);
    }
    return refreshing.get(provider.id);
}
