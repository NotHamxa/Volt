import { registerProvider, trimHistory } from "./provider.js";
import { getKey } from "./credentials.js";
import { sseEvents } from "./sse.js";

/**
 * Google Gemini over its REST API.
 *
 * Unlike the OpenAI-compatible vendors this needs its own adapter: roles are
 * "user"/"model" rather than "user"/"assistant", turns are `parts` arrays, and
 * the key goes in a header rather than a bearer token. Streaming is still SSE
 * once `alt=sse` is asked for — without it the endpoint returns a JSON array.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const ID = "gemini";

const FALLBACK_MODELS = [
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
];

const NORMAL_FINISH = new Set(["STOP", "FINISH_REASON_UNSPECIFIED"]);

/** "PROHIBITED_CONTENT" → "prohibited content". */
const readable = (reason) => String(reason).toLowerCase().replace(/_/g, " ");

async function describeFailure(response) {
    const text = await response.text().catch(() => "");
    try {
        const json = JSON.parse(text);
        const message = json?.error?.message ?? json?.[0]?.error?.message;
        if (message) return message;
    } catch { /* not JSON */ }
    if (response.status === 400) return "Gemini rejected the request — the key may be invalid.";
    if (response.status === 429) return "Rate limited by Google.";
    return text.slice(0, 200) || `Request failed (HTTP ${response.status}).`;
}

export const geminiProvider = registerProvider({
    id: ID,
    label: "Gemini",
    kind: "api",
    needsKey: true,

    async isAvailable() {
        if (!getKey(ID)) return { available: false, detail: "No API key saved." };
        return { available: true, detail: "Key saved." };
    },

    async models() {
        const key = getKey(ID);
        if (!key) return FALLBACK_MODELS;
        try {
            const response = await fetch(`${BASE}/models`, {
                headers: { "x-goog-api-key": key },
                signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) return FALLBACK_MODELS;
            const json = await response.json();
            const ids = (json?.models ?? [])
                // Only models that can actually answer a prompt — the list also
                // carries embedding and vision-only entries.
                .filter(m => (m?.supportedGenerationMethods ?? []).includes("generateContent"))
                .map(m => String(m?.name ?? "").replace(/^models\//, ""))
                .filter(Boolean)
                .sort();
            return ids.length ? ids.map(id => ({ id, label: id })) : FALLBACK_MODELS;
        } catch {
            return FALLBACK_MODELS;
        }
    },

    controls() {
        return [];
    },

    async *send({ prompt, history, model, signal }) {
        const key = getKey(ID);
        if (!key) {
            yield { type: "error", message: "No API key saved for Gemini." };
            return;
        }

        const turns = (history ?? []).filter(m => m.content?.trim());
        const last = turns.at(-1);
        if (!last || last.role !== "user" || last.content !== prompt) {
            turns.push({ role: "user", content: prompt });
        }
        const contents = trimHistory(turns).map(m => ({
            // Gemini calls the assistant "model".
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));

        const chosen = model || FALLBACK_MODELS[0].id;
        let response;
        try {
            response = await fetch(
                `${BASE}/models/${encodeURIComponent(chosen)}:streamGenerateContent?alt=sse`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                    body: JSON.stringify({ contents }),
                    signal,
                },
            );
        } catch (err) {
            if (signal?.aborted) { yield { type: "done" }; return; }
            yield { type: "error", message: err?.message ?? "Could not reach Gemini." };
            return;
        }

        if (!response.ok || !response.body) {
            yield { type: "error", message: await describeFailure(response) };
            return;
        }

        try {
            for await (const payload of sseEvents(response)) {
                let event;
                try {
                    event = JSON.parse(payload);
                } catch {
                    continue;
                }
                if (event?.error) {
                    yield { type: "error", message: event.error.message ?? "Gemini reported an error." };
                    break;
                }
                // A blocked prompt arrives as a normal event with no
                // candidates at all, so without this the turn just ended
                // empty with no hint why.
                const blocked = event?.promptFeedback?.blockReason;
                if (blocked) {
                    yield { type: "error", message: `Gemini blocked the prompt (${readable(blocked)}).` };
                    break;
                }
                const candidate = event?.candidates?.[0];
                for (const part of candidate?.content?.parts ?? []) {
                    if (!part?.text) continue;
                    // Gemini returns thinking as ordinary text parts flagged
                    // with `thought`, so without this check the reasoning would
                    // be concatenated straight into the answer.
                    if (part.thought) yield { type: "reasoning", text: part.text };
                    else yield { type: "text", text: part.text };
                }
                // Likewise a safety stop mid-answer: the stream simply ends.
                const reason = candidate?.finishReason;
                if (reason && !NORMAL_FINISH.has(reason)) {
                    yield {
                        type: "error",
                        message: reason === "MAX_TOKENS"
                            ? "Gemini stopped at its output length limit."
                            : `Gemini stopped the answer (${readable(reason)}).`,
                    };
                    break;
                }
            }
        } catch (err) {
            if (!signal?.aborted) {
                yield { type: "error", message: err?.message ?? "The stream failed." };
                return;
            }
        }

        yield { type: "done" };
    },
});
