import path from "path";

/**
 * Turning a provider's raw step into something worth putting on screen.
 *
 * The point of showing these is that a long silence stops looking like a
 * hang, so they have to be readable at a glance: a verb and the one thing it
 * acted on. Full arguments would be a wall of JSON that tells you less.
 *
 * A step is `{ id, parentId?, kind, label, detail?, status, output? }`, sent
 * as it starts and again as it ends; ai.ipc merges the two by id and stamps
 * the times. `kind` picks the icon in the view.
 */

/** Last two segments of a path, enough to recognise, short enough to fit. */
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

/**
 * What a step's output looks like on screen: the tail, since that is where a
 * command reports how it ended, and short enough to sit in a transcript.
 */
export function clipOutput(text, max = 2000) {
    if (typeof text !== "string") return "";
    const trimmed = text.replace(/\r\n/g, "\n").trimEnd();
    return trimmed.length > max ? "…" + trimmed.slice(-max) : trimmed;
}

/** A tool result's content as text: a string, or an array of content blocks. */
export function toolResultText(content) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .map(block => (block?.type === "text" ? block.text : block?.type === "image" ? "[image]" : ""))
        .filter(Boolean)
        .join("\n");
}

/**
 * Claude's own bookkeeping: the plan it keeps, and the index it loads tool
 * definitions from. None of it touches the machine, so it's neither approved
 * nor shown as a step, the plan is drawn as a plan instead.
 */
export const PLANNING_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"]);
export const QUIET_TOOLS = new Set([...PLANNING_TOOLS, "ToolSearch"]);

/** Present-tense verb plus target, for the tools the Claude CLI exposes. */
export function describeTool(name, input) {
    input = input ?? {};
    switch (name) {
        case "Read":         return { kind: "read", label: "Reading", detail: shortPath(input.file_path) };
        case "Write":        return { kind: "write", label: "Writing", detail: shortPath(input.file_path) };
        case "Edit":
        case "MultiEdit":    return { kind: "write", label: "Editing", detail: shortPath(input.file_path) };
        case "NotebookEdit": return { kind: "write", label: "Editing", detail: shortPath(input.notebook_path) };
        case "Bash":
        case "PowerShell":   return { kind: "command", label: "Running", detail: firstLine(input.command) };
        case "BashOutput":   return { kind: "command", label: "Reading output" };
        case "KillShell":
        case "TaskStop":     return { kind: "command", label: "Stopping a command" };
        case "Glob":         return { kind: "search", label: "Finding files", detail: firstLine(input.pattern) };
        case "Grep":         return { kind: "search", label: "Searching", detail: firstLine(input.pattern) };
        case "WebSearch":    return { kind: "web", label: "Searching the web", detail: firstLine(input.query) };
        case "WebFetch":     return { kind: "web", label: "Fetching", detail: firstLine(input.url) };
        case "Task":
        case "Agent":        return { kind: "agent", label: "Delegating", detail: firstLine(input.description) };
        case "Skill":        return { kind: "tool", label: "Using skill", detail: firstLine(input.skill ?? input.name) };
        case "ExitPlanMode": return { kind: "tool", label: "Proposing a plan" };
        case "EnterPlanMode": return { kind: "tool", label: "Planning" };
        default:
            // Unknown or MCP tools still say something useful rather than
            // vanishing, the name alone is better than silence.
            return {
                kind: "tool",
                label: "Using",
                detail: firstLine(String(name ?? "").replace(/^mcp__/, "").replace(/__/g, " › ")),
            };
    }
}

/**
 * Codex wraps every command in the shell it ran it with,
 * `"C:\…\pwsh.exe" -Command 'git status'`, which buries the part worth
 * reading behind a path. The command itself is what the trace should show.
 */
export function unwrapShell(command) {
    if (typeof command !== "string") return command;
    const m = /^"?[^"]*?(?:pwsh|powershell|cmd|bash|sh)(?:\.exe)?"?\s+(?:-Command|-c|\/c)\s+([\s\S]*)$/i.exec(command.trim());
    if (!m) return command;
    const inner = m[1].trim();
    // Quoted as a whole: strip the one pair, and undo PowerShell's '' escape.
    if (/^'[\s\S]*'$/.test(inner)) return inner.slice(1, -1).replace(/''/g, "'");
    if (/^"[\s\S]*"$/.test(inner)) return inner.slice(1, -1);
    return inner;
}

/**
 * Codex reports work as typed "items" on its event stream. The names are the
 * CLI's own; anything unrecognised falls back to a readable form of the type,
 * so a schema change degrades to a vague line instead of nothing.
 */
export function describeCodexItem(item = {}) {
    switch (item.type) {
        // The app-server names its items in camelCase; `codex exec` used
        // snake_case. Both are read, so older traces still describe.
        case "commandExecution":
        case "command_execution":
            return { kind: "command", label: "Running", detail: firstLine(unwrapShell(item.command ?? item.parsed_cmd)) };
        case "fileChange":
        case "file_change": {
            const files = Array.isArray(item.changes)
                ? item.changes.map(c => shortPath(c.path)).filter(Boolean)
                : [];
            return {
                kind: "write",
                label: "Editing",
                detail: files.length > 1 ? `${files[0]} +${files.length - 1} more` : files[0],
            };
        }
        case "webSearch":
        case "web_search":
            return item.action?.type === "openPage"
                ? { kind: "web", label: "Fetching", detail: firstLine(item.action.url) }
                : { kind: "web", label: "Searching the web", detail: firstLine(item.query || item.action?.query) };
        case "mcpToolCall":
        case "mcp_tool_call":
            return { kind: "tool", label: "Using", detail: firstLine([item.server, item.tool].filter(Boolean).join(" › ")) };
        case "dynamicToolCall":
            return { kind: "tool", label: "Using", detail: firstLine([item.namespace, item.tool].filter(Boolean).join(" › ")) };
        case "collabAgentToolCall":
            return { kind: "agent", label: "Delegating", detail: firstLine(item.prompt ?? item.tool) };
        case "imageView":
            return { kind: "read", label: "Reading", detail: shortPath(item.path) };
        case "contextCompaction":
            return { kind: "tool", label: "Compacted the conversation" };
        default:
            return { kind: "tool", label: String(item.type ?? "Working").replace(/[_.]/g, " ") };
    }
}
