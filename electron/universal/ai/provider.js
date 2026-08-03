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
 * @typedef {{ type: "text", text: string }
 *          | { type: "error", message: string }
 *          | { type: "done", sessionId?: string }} Chunk
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: "subscription-sdk" | "subscription-cli" | "api",
 *   needsKey: boolean,
 *   isAvailable: () => Promise<{ available: boolean, detail?: string }>,
 *   models: () => Promise<Array<{ id: string, label: string, controls?: AiControl[] }>>,
 *   controls: () => Array<{ id: string, label: string, type: "select", options: Array<{ id: string, label: string }>, default: string }>,
 *   billing?: () => { mode: "subscription" | "api-key" | "unknown", label: string },
 *   send: (opts: { prompt: string, sessionId?: string|null, model?: string, settings?: Record<string,string>, signal?: AbortSignal }) => AsyncIterable<Chunk>,
 * }} AiProvider
 */

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
        let models = [];
        if (availability.available) {
            try {
                models = await p.models();
            } catch { /* a provider with no model list is still usable */ }
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
            models,
            controls: p.controls(),
        };
    }));
    return described;
}
