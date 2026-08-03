import { registerProvider } from "./provider.js";
import { getKey } from "./credentials.js";

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

async function* sseEvents(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            for (const line of raw.split("\n")) {
                if (line.startsWith("data:")) yield line.slice(5).trim();
            }
        }
    }
}

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

        const priorTurns = (history ?? []).filter(m => m.content?.trim());
        const contents = priorTurns.map(m => ({
            // Gemini calls the assistant "model".
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));
        const last = priorTurns.at(-1);
        if (!last || last.role !== "user" || last.content !== prompt) {
            contents.push({ role: "user", parts: [{ text: prompt }] });
        }

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
                for (const part of event?.candidates?.[0]?.content?.parts ?? []) {
                    if (part?.text) yield { type: "text", text: part.text };
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
