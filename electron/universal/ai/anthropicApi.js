import Anthropic from "@anthropic-ai/sdk";
import { registerProvider, trimHistory } from "./provider.js";
import { getKey } from "./credentials.js";
import { expandAttachments, hasContent } from "./attachments.js";

/**
 * Claude over the Anthropic API, with a key from the Claude Console.
 *
 * For anyone without the Claude CLI, or who'd rather pay per token than use a
 * plan. Unlike the CLI provider this one has no tools: it answers, it doesn't
 * act on the machine. Like the other key providers it keeps no thread, so the
 * transcript goes with every turn.
 */

const ID = "anthropic";

const EFFORT_LABELS = {
    low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max",
};
const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max"];

function effortControl(levels) {
    if (!levels?.length) return [];
    return [{
        id: "effort",
        label: "Effort",
        type: "select",
        options: levels.map(level => ({ id: level, label: EFFORT_LABELS[level] ?? level })),
        default: levels.includes("high") ? "high" : levels[levels.length - 1],
    }];
}

/** Used until the key can be asked, and if the models endpoint can't be reached. */
const FALLBACK_MODELS = [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", controls: effortControl(EFFORT_ORDER) },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", controls: effortControl(EFFORT_ORDER) },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", controls: effortControl(EFFORT_ORDER) },
];
const DEFAULT_MODEL = FALLBACK_MODELS[0].id;

/**
 * Models that take the server-side refusal fallback: when a safety check
 * declines a turn, the API re-runs it on a model that can answer rather than
 * the reply simply stopping.
 */
const FALLBACK_CAPABLE = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

// The catalogue as the API reports it, with each model's capabilities. Keyed
// by the key it was read with, so changing keys reads it again.
let catalogue = null;

// An explicit key also stops the SDK reaching for credentials in the
// environment or on disk, so only the key saved here is ever used.
function client(apiKey) {
    return new Anthropic({ apiKey });
}

async function readCatalogue(apiKey) {
    if (catalogue?.key === apiKey) return catalogue.models;
    const models = [];
    for await (const info of client(apiKey).models.list({ limit: 100 })) models.push(info);
    catalogue = { key: apiKey, models };
    return models;
}

/** What the API says a model can do, if it's been asked yet. */
function capabilitiesOf(modelId) {
    return catalogue?.models.find(m => m.id === modelId) ?? null;
}

/** The effort levels a model accepts, in order. */
function effortLevels(info) {
    const effort = info?.capabilities?.effort;
    if (!effort?.supported) return [];
    return EFFORT_ORDER.filter(level => effort[level]?.supported);
}

/**
 * A user turn as content blocks: the images it carried, then its text. The
 * API keeps no thread, so images go again with every turn they belong to.
 */
function userContent(message) {
    if (!message.attachments?.length) return message.content;
    const { text, images } = expandAttachments(message.content, message.attachments, { images: true });
    return [
        ...images.map(i => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.data } })),
        { type: "text", text },
    ];
}

/** Errors in words a person can act on. */
function describeError(err) {
    if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key. Check it in Settings → AI.";
    if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
    if (err instanceof Anthropic.NotFoundError) return "Anthropic doesn't recognise that model.";
    if (err instanceof Anthropic.RateLimitError) return "Rate limited by Anthropic. Wait a moment and try again.";
    if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API.";
    if (err instanceof Anthropic.APIError) {
        const detail = err.error?.error?.message ?? err.message;
        return err.status ? `Anthropic API error ${err.status}: ${detail}` : detail;
    }
    return err?.message ?? "The request failed.";
}

export const anthropicProvider = registerProvider({
    id: ID,
    label: "Claude (API key)",
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
            const models = await readCatalogue(key);
            if (!models.length) return FALLBACK_MODELS;
            return models.map(info => ({
                id: info.id,
                label: info.display_name || info.id,
                controls: effortControl(effortLevels(info)),
            }));
        } catch {
            return FALLBACK_MODELS;
        }
    },

    // Effort differs per model and comes with the catalogue.
    controls() {
        return [];
    },

    async *send({ prompt, attachments, history, model, settings, signal }) {
        const key = getKey(ID);
        if (!key) {
            yield { type: "error", message: "No API key saved for Claude." };
            yield { type: "done" };
            return;
        }

        // The caller appends an empty assistant turn to stream into; it must
        // not be sent back as part of the conversation.
        const turns = (history ?? []).filter(hasContent).map(m => ({ ...m }));
        const last = turns.at(-1);
        if (!last || last.role !== "user" || last.content !== prompt) {
            turns.push({ role: "user", content: prompt, attachments });
        } else {
            last.attachments = attachments;
        }
        const messages = trimHistory(turns).map(m => ({
            role: m.role,
            content: m.role === "user" ? userContent(m) : m.content,
        }));

        const chosen = model || DEFAULT_MODEL;
        const info = capabilitiesOf(chosen);
        const params = {
            model: chosen,
            // Streamed, so a long answer doesn't hit a request timeout.
            max_tokens: Math.min(info?.max_tokens ?? 64000, 64000),
            messages,
        };
        // Thinking is shown as it happens; without "summarized" recent
        // models send it empty, and a long pause has nothing behind it.
        const adaptive = info ? info.capabilities?.thinking?.types?.adaptive?.supported : true;
        if (adaptive) params.thinking = { type: "adaptive", display: "summarized" };
        const levels = info ? effortLevels(info) : EFFORT_ORDER;
        if (settings?.effort && levels.includes(settings.effort)) {
            params.output_config = { effort: settings.effort };
        }

        const api = client(key);
        let stream;
        try {
            stream = FALLBACK_CAPABLE.has(chosen)
                ? api.beta.messages.stream(
                    { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
                    { signal },
                )
                : api.messages.stream(params, { signal });

            for await (const event of stream) {
                if (event.type === "message_start" && event.message?.model) {
                    yield { type: "stats", stats: { model: event.message.model } };
                }
                if (event.type !== "content_block_delta") continue;
                if (event.delta.type === "thinking_delta" && event.delta.thinking) {
                    yield { type: "reasoning", text: event.delta.thinking };
                } else if (event.delta.type === "text_delta" && event.delta.text) {
                    yield { type: "text", text: event.delta.text };
                }
            }

            const final = await stream.finalMessage();
            const usage = final.usage ?? {};
            yield {
                type: "stats",
                stats: {
                    // The model that answered, after a fallback, not the one asked.
                    model: final.model,
                    inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
                    outputTokens: usage.output_tokens,
                },
            };
            if (final.stop_reason === "refusal") {
                const why = final.stop_details?.explanation;
                yield { type: "error", message: why ? `Claude declined to answer: ${why}` : "Claude declined to answer this." };
            } else if (final.stop_reason === "max_tokens") {
                yield { type: "error", message: "Claude stopped at its output length limit." };
            }
        } catch (err) {
            if (!signal?.aborted && !(err instanceof Anthropic.APIUserAbortError)) {
                yield { type: "error", message: describeError(err) };
            }
        }

        yield { type: "done" };
    },
});
