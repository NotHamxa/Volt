import path from "path";

/**
 * Turning a provider's raw step into something worth putting on screen.
 *
 * The point of showing these is that a long silence stops looking like a
 * hang, so they have to be readable at a glance: a verb and the one thing it
 * acted on. Full arguments would be a wall of JSON that tells you less.
 */

/** Last two segments of a path — enough to recognise, short enough to fit. */
export function shortPath(p) {
    if (typeof p !== "string" || !p) return "";
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.slice(-2).join("/") || path.basename(p);
}

function firstLine(s, max = 90) {
    if (typeof s !== "string") return "";
    const line = s.split("\n")[0].trim();
    return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

/** Present-tense verb plus target, for the tools the Claude CLI exposes. */
export function describeTool(name, input = {}) {
    switch (name) {
        case "Read":         return { label: "Reading", detail: shortPath(input.file_path) };
        case "Write":        return { label: "Writing", detail: shortPath(input.file_path) };
        case "Edit":         return { label: "Editing", detail: shortPath(input.file_path) };
        case "NotebookEdit": return { label: "Editing", detail: shortPath(input.notebook_path) };
        case "Bash":         return { label: "Running", detail: firstLine(input.command) };
        case "BashOutput":   return { label: "Reading output" };
        case "KillShell":    return { label: "Stopping a command" };
        case "Glob":         return { label: "Finding files", detail: firstLine(input.pattern) };
        case "Grep":         return { label: "Searching", detail: firstLine(input.pattern) };
        case "WebSearch":    return { label: "Searching the web", detail: firstLine(input.query) };
        case "WebFetch":     return { label: "Fetching", detail: firstLine(input.url) };
        case "Task":         return { label: "Delegating", detail: firstLine(input.description) };
        case "TodoWrite":    return { label: "Planning" };
        default:
            // Unknown or MCP tools still say something useful rather than
            // vanishing — the name alone is better than silence.
            return { label: "Using", detail: firstLine(name) };
    }
}

/**
 * Codex reports work as typed "items" on its event stream. The names are the
 * CLI's own; anything unrecognised falls back to a readable form of the type,
 * so a schema change degrades to a vague line instead of nothing.
 */
export function describeCodexItem(item = {}) {
    switch (item.type) {
        case "command_execution":
            return { label: "Running", detail: firstLine(item.command ?? item.parsed_cmd) };
        case "file_change": {
            const files = Array.isArray(item.changes)
                ? item.changes.map(c => shortPath(c.path)).filter(Boolean)
                : [];
            return {
                label: "Editing",
                detail: files.length > 1 ? `${files[0]} +${files.length - 1} more` : files[0],
            };
        }
        case "web_search":
            return { label: "Searching the web", detail: firstLine(item.query) };
        case "mcp_tool_call":
            return { label: "Using", detail: firstLine(item.tool ?? item.server) };
        case "todo_list":
            return { label: "Planning" };
        default:
            return { label: String(item.type ?? "Working").replace(/[_.]/g, " ") };
    }
}
