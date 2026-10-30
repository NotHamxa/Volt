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
 *
 * Expanded, a step also shows what it was given: `input` (the whole command,
 * what was written, the change an edit made, as a diff when `inputFormat` is
 * "diff") and `images` (thumbnails of pictures it read). Without them a write
 * said only "File created successfully" and an image read said "[image]".
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

/**
 * The start of a long text, for things read top-down: a file's contents, what
 * was written to one. A command's output keeps its tail instead (clipOutput).
 */
export function clipHead(text, max = 3000) {
    if (typeof text !== "string") return "";
    const trimmed = text.replace(/\r\n/g, "\n").trimEnd();
    return trimmed.length > max ? trimmed.slice(0, max) + "\n…" : trimmed;
}

/**
 * A tool result's content as text: a string, or an array of content blocks.
 * Images become "[image]" unless they're being shown as pictures instead.
 */
export function toolResultText(content, { imagePlaceholder = true } = {}) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .map(block => (block?.type === "text" ? block.text : block?.type === "image" && imagePlaceholder ? "[image]" : ""))
        .filter(Boolean)
        .join("\n");
}

const INPUT_MAX = 4000;

/** An edit as removed and added lines, the way a diff reads. */
function editDiff(before, after) {
    const lines = (text, mark) => (typeof text === "string" && text ? text.replace(/\r\n/g, "\n").split("\n").map(l => mark + l) : []);
    return [...lines(before, "-"), ...lines(after, "+")].join("\n");
}

function asInput(text, inputFormat = "code") {
    const input = clipHead(typeof text === "string" ? text : "", INPUT_MAX);
    return input ? { input, inputFormat } : {};
}

/** What a Claude tool call was given, for its expanded step. */
export function describeToolInput(name, input) {
    input = input ?? {};
    switch (name) {
        case "Write":        return asInput(input.content);
        case "Edit":         return asInput(editDiff(input.old_string, input.new_string), "diff");
        case "MultiEdit":
            return asInput((input.edits ?? []).map(e => editDiff(e?.old_string, e?.new_string)).join("\n@@\n"), "diff");
        case "NotebookEdit": return asInput(input.new_source);
        case "Bash":
        case "PowerShell":   return asInput(input.command);
        case "Grep":
            return asInput([input.pattern, input.path && `in ${input.path}`, input.glob && `files ${input.glob}`].filter(Boolean).join("\n"), "text");
        case "Glob":         return asInput([input.pattern, input.path && `in ${input.path}`].filter(Boolean).join("\n"), "text");
        case "WebFetch":     return asInput([input.url, input.prompt].filter(Boolean).join("\n\n"), "text");
        case "Task":
        case "Agent":        return asInput(input.prompt, "text");
        case "Read":
        case "BashOutput":
        case "KillShell":
        case "TaskStop":
        case "WebSearch":
        case "Skill":
        case "ExitPlanMode":
        case "EnterPlanMode":
            // The one-line detail already says all there is.
            return {};
        default:
            // MCP and anything new: the arguments, which is what there is.
            return Object.keys(input).length ? asInput(JSON.stringify(input, null, 2)) : {};
    }
}

/** What a Codex item was given, for its expanded step. */
export function describeCodexInput(item = {}) {
    switch (item.type) {
        case "commandExecution":
        case "command_execution":
            return asInput(unwrapShell(item.command ?? item.parsed_cmd));
        case "fileChange":
        case "file_change":
            // Each change carries a unified diff of what it did to its file.
            return asInput((item.changes ?? [])
                .map(c => [`${c?.kind?.type ?? c?.kind ?? "edit"} ${c?.path ?? ""}`.trim(), typeof c?.diff === "string" ? c.diff : ""].filter(Boolean).join("\n"))
                .join("\n\n"), "diff");
        case "mcpToolCall":
        case "mcp_tool_call":
        case "dynamicToolCall":
            return item.arguments && typeof item.arguments === "object" && Object.keys(item.arguments).length
                ? asInput(JSON.stringify(item.arguments, null, 2))
                : {};
        case "collabAgentToolCall":
            return asInput(item.prompt, "text");
        default:
            return {};
    }
}

/**
 * Claude's own bookkeeping: the plan it keeps, and the index it loads tool
 * definitions from. None of it touches the machine, so it's neither approved
 * nor shown as a step, the plan is drawn as a plan instead.
 */
export const PLANNING_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate"]);
export const QUIET_TOOLS = new Set([...PLANNING_TOOLS, "ToolSearch"]);

/** Calls that hand work to a subagent, whose own steps then sit under them. */
export const AGENT_TOOLS = new Set(["Agent", "Task"]);

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
