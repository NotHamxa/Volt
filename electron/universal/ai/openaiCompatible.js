import { registerProvider } from "./provider.js";
import { getKey } from "./credentials.js";

/**
 * One adapter for every vendor that speaks the OpenAI chat-completions dialect
 * — OpenAI, DeepSeek, xAI. They differ only by base URL and model catalogue, so
 * a factory beats three near-identical files.
 *
 * These endpoints are stateless: there is no server-side thread to resume, so
 * each turn re-sends the transcript. That is why `send` takes `history`.
 *
 * Raw fetch rather than the vendor SDK: streaming chat completions is a dozen
 * lines of SSE, and the installer already carries an Electron runtime.
 */

/** Reads an SSE body and yields each decoded `data:` payload. */
async function* sseEvents(response, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Events are separated by a blank line; a chunk can split mid-event,
            // so only complete ones are consumed and the tail is kept.
            let boundary;
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
                const raw = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                for (const line of raw.split("\n")) {
                    if (!line.startsWith("data:")) continue;
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]") return;
                    yield payload;
                }
            }
        }
    } finally {
        if (signal?.aborted) reader.cancel().catch(() => {});
    }
}

/** Vendors return errors as JSON, plain text, or an HTML error page. */
async function describeFailure(response) {
    const text = await response.text().catch(() => "");
    try {
        const json = JSON.parse(text);
        const message = json?.error?.message ?? json?.message;
        if (message) return message;
    } catch { /* not JSON */ }
    if (response.status === 401) return "The API key was rejected.";
    if (response.status === 429) return "Rate limited by the provider.";
    return text.slice(0, 200) || `Request failed (HTTP ${response.status}).`;
}

function createOpenAiCompatible({
    id, label, baseUrl, fallbackModels, modelFilter,
    // Local servers speak the same dialect without authentication.
    needsKey = true, kind = "api", missingDetail,
}) {
    const authHeaders = () => {
        if (!needsKey) return {};
        const key = getKey(id);
        return key ? { Authorization: `Bearer ${key}` } : {};
    };

    return registerProvider({
        id,
        label,
        kind,
        needsKey,

        async isAvailable() {
            if (needsKey) {
                if (!getKey(id)) return { available: false, detail: "No API key saved." };
                return { available: true, detail: "Key saved." };
            }
            // Keyless means local: reachability is the only real question.
            try {
                const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
                if (response.ok) return { available: true, detail: `Reachable at ${baseUrl}` };
            } catch { /* not running */ }
            return { available: false, detail: missingDetail ?? `Not reachable at ${baseUrl}` };
        },

        async models() {
            if (needsKey && !getKey(id)) return fallbackModels;
            // Asking the vendor beats hard-coding a list that goes stale.
            try {
                const response = await fetch(`${baseUrl}/models`, {
                    headers: authHeaders(),
                    signal: AbortSignal.timeout(8000),
                });
                if (!response.ok) return fallbackModels;
                const json = await response.json();
                // Newest first. These catalogues are long — OpenAI's runs to
                // dozens — and alphabetical put gpt-3.5 above gpt-5, which is
                // the wrong end of the list to lead with. `created` is the
                // vendor's own release stamp, so this doesn't go stale.
                const models = (json?.data ?? [])
                    .filter(m => m?.id && (modelFilter ?? (() => true))(m.id))
                    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id));
                return models.length
                    ? models.map(m => ({ id: m.id, label: m.id }))
                    : fallbackModels;
            } catch {
                return fallbackModels;
            }
        },

        controls() {
            return [];
        },

        async *send({ prompt, history, model, signal }) {
            if (needsKey && !getKey(id)) {
                yield { type: "error", message: `No API key saved for ${label}.` };
                return;
            }

            // The caller appends an empty assistant turn to stream into; it
            // must not be sent back as part of the conversation.
            const priorTurns = (history ?? []).filter(m => m.content?.trim());
            const messages = [...priorTurns.map(m => ({ role: m.role, content: m.content }))];
            if (messages.at(-1)?.role !== "user" || messages.at(-1)?.content !== prompt) {
                messages.push({ role: "user", content: prompt });
            }

            let response;
            try {
                response = await fetch(`${baseUrl}/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ model, messages, stream: true }),
                    signal,
                });
            } catch (err) {
                if (signal?.aborted) { yield { type: "done" }; return; }
                yield { type: "error", message: err?.message ?? "Could not reach the provider." };
                return;
            }

            if (!response.ok || !response.body) {
                yield { type: "error", message: await describeFailure(response) };
                return;
            }

            try {
                for await (const payload of sseEvents(response, signal)) {
                    let event;
                    try {
                        event = JSON.parse(payload);
                    } catch {
                        continue; // keep-alive or partial frame
                    }
                    // Some vendors report mid-stream errors in-band.
                    if (event?.error) {
                        yield { type: "error", message: event.error.message ?? "The provider reported an error." };
                        break;
                    }
                    const delta = event?.choices?.[0]?.delta;
                    if (delta?.content) yield { type: "text", text: delta.content };
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
}

// Chat models only — the catalogues also list embeddings, audio and images.
const CHAT_ONLY = (modelId) =>
    !/embed|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe/i.test(modelId);

export const openaiProvider = createOpenAiCompatible({
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    fallbackModels: [{ id: "gpt-4o", label: "gpt-4o" }],
    modelFilter: (modelId) => CHAT_ONLY(modelId) && /^(gpt|o\d)/i.test(modelId),
});

export const deepseekProvider = createOpenAiCompatible({
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    fallbackModels: [
        { id: "deepseek-chat", label: "deepseek-chat" },
        { id: "deepseek-reasoner", label: "deepseek-reasoner" },
    ],
});

export const grokProvider = createOpenAiCompatible({
    id: "grok",
    label: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1",
    fallbackModels: [{ id: "grok-2-latest", label: "grok-2-latest" }],
    modelFilter: CHAT_ONLY,
});

// Ollama serves an OpenAI-compatible endpoint alongside its own, so local
// models come along for free. Nothing leaves the machine, and no key is needed.
export const ollamaProvider = createOpenAiCompatible({
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    kind: "subscription-cli",
    needsKey: false,
    fallbackModels: [],
    missingDetail: "Ollama isn't running. Start it, then re-check.",
});
