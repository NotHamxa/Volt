/**
 * The one definition of what a custom command may contain.
 *
 * Imported files and AI-drafted commands both land here. Keeping a single
 * validator matters more than the duplication it saves: a second, looser path
 * into the command list is a way to end up executing something unvetted.
 */

export const COMMAND_TYPES = ["command", "commandConfirm", "commandOpen", "commandConfirmOpen"];
export const SHELLS = ["auto", "cmd", "powershell"];

/** Placeholders in a script are `{name}`, so names are restricted to match. */
const ARG_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const asString = (value) => (typeof value === "string" ? value : undefined);

function sanitiseArgs(args) {
    if (!Array.isArray(args)) return undefined;
    const cleaned = args
        .filter(a => a?.name && ARG_NAME.test(a.name))
        .map(a => ({
            name: a.name,
            label: asString(a.label),
            description: asString(a.description),
            defaultValue: asString(a.defaultValue),
            required: !!a.required,
        }));
    return cleaned.length ? cleaned : undefined;
}

/**
 * Returns a command safe to store, or null if it isn't one.
 *
 * Nothing here decides whether a script is *wise* to run — that judgement
 * stays with the person reading it before they save it.
 */
export function sanitiseCommand(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = asString(raw.name)?.trim();
    const path = asString(raw.path);
    if (!name || !path?.trim()) return null;

    return {
        name,
        type: COMMAND_TYPES.includes(raw.type) ? raw.type : "command",
        appId: null,
        path,
        source: "custom",
        shell: SHELLS.includes(raw.shell) ? raw.shell : "auto",
        args: sanitiseArgs(raw.args),
    };
}

/** Every placeholder the script uses, in the order it first uses them. */
export function placeholdersIn(script) {
    const found = [];
    for (const match of String(script ?? "").matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) {
        if (!found.includes(match[1])) found.push(match[1]);
    }
    return found;
}

/**
 * Complaints a human should see before saving, rather than reasons to reject.
 * A declared-but-unused argument is untidy; a placeholder with no argument
 * behind it would substitute as empty at run time, which is worse.
 */
export function reviewCommand(command) {
    const notes = [];
    const used = placeholdersIn(command.path);
    const declared = (command.args ?? []).map(a => a.name);

    for (const name of used) {
        if (!declared.includes(name)) {
            notes.push(`The script uses {${name}} but declares no argument for it.`);
        }
    }
    for (const name of declared) {
        if (!used.includes(name)) {
            notes.push(`Argument "${name}" is declared but never used in the script.`);
        }
    }
    return notes;
}
