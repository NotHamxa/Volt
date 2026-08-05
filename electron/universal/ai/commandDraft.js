import { getProvider } from "./provider.js";
import { sanitiseCommand, reviewCommand, COMMAND_TYPES, SHELLS } from "../commandSchema.js";

/**
 * Drafts a custom command from a description, using whichever AI provider is
 * already configured.
 *
 * The result is only ever a *draft*. It is sanitised through the same validator
 * as an imported file, handed to the renderer for review, and saved only if the
 * person reading the script chooses to. Nothing generated here is executed.
 */

const TYPE_NOTES = {
    command: "run silently in the background",
    commandConfirm: "ask for confirmation first, then run silently",
    commandOpen: "run in a visible terminal window",
    commandConfirmOpen: "ask for confirmation, then run in a visible terminal",
};

function instructionFor({ description, existing, platform }) {
    const shape = {
        name: "short human-readable name",
        type: COMMAND_TYPES.join(" | "),
        shell: SHELLS.join(" | "),
        path: "the script to run, with {placeholders} for any arguments",
        args: [{ name: "identifier", label: "Label", description: "what it is", defaultValue: "", required: true }],
    };

    return [
        `You are drafting a launcher command for ${platform === "win32" ? "Windows" : platform}.`,
        "",
        "Reply with a single JSON object and nothing else — no prose, no code fence.",
        `Shape: ${JSON.stringify(shape)}`,
        "",
        "Rules:",
        `- "path" holds the actual script text. On Windows prefer "powershell" as the shell unless a cmd builtin is genuinely required.`,
        `- Types: ${Object.entries(TYPE_NOTES).map(([k, v]) => `"${k}" = ${v}`).join("; ")}.`,
        `- Choose a confirming type when the command deletes, overwrites, shuts down, or is otherwise hard to undo.`,
        `- Choose an "Open" type when the user will want to read the output.`,
        `- Arguments are optional. Use them only for values that genuinely vary per run.`,
        `- Every {placeholder} in the script must have a matching entry in "args", and every arg must be used.`,
        `- Argument names must match ${"/^[a-zA-Z_][a-zA-Z0-9_]*$/"}.`,
        `- Omit "args" entirely if the command takes none.`,
        "",
        existing
            ? `Modify this existing command. Keep what still fits and change only what the request asks for:\n${JSON.stringify(existing, null, 2)}`
            : "",
        "",
        `Request: ${description}`,
    ].filter(Boolean).join("\n");
}

/**
 * Models wrap JSON in prose or fences however they like, so take the outermost
 * balanced object rather than trusting the whole reply to parse.
 */
export function extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;

    const start = candidate.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
        const char = candidate[i];
        if (escaped) { escaped = false; continue; }
        if (char === "\\") { escaped = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (char === "{") depth++;
        else if (char === "}") {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(candidate.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

export async function draftCommand({
    providerId, model, settings, description, existing, signal,
}) {
    if (!description?.trim()) return { ok: false, detail: "Describe what the command should do." };

    const provider = getProvider(providerId);
    if (!provider) return { ok: false, detail: `Unknown provider: ${providerId}` };

    const prompt = instructionFor({ description, existing, platform: process.platform });

    let text = "";
    let failure = null;
    try {
        // A one-shot turn: no session id, so this never joins a conversation.
        for await (const chunk of provider.send({ prompt, model, settings, history: [], signal })) {
            if (chunk.type === "text") text += chunk.text;
            if (chunk.type === "error") failure = chunk.message;
        }
    } catch (err) {
        return { ok: false, detail: err?.message ?? "The provider failed." };
    }

    if (failure && !text.trim()) return { ok: false, detail: failure };

    const parsed = extractJson(text);
    if (!parsed) {
        return { ok: false, detail: "The model didn't return a command. Try rewording the request." };
    }

    const command = sanitiseCommand(parsed);
    if (!command) {
        return { ok: false, detail: "The draft was missing a name or a script." };
    }

    return { ok: true, command, notes: reviewCommand(command) };
}
