/**
 * Rewrites the ways models write math into the one remark-math reads.
 *
 * Answers mix `$x$`, `$$x$$` on a line of its own, `\(x\)` and `\[x\]`.
 * remark-math only knows dollars, and only treats `$$` as a display block
 * when the fences sit on their own lines, a one-line `$$x = 1$$` came out as
 * small inline math, and anything after an opening `$$` on its line was
 * dropped as the fence's "meta".
 *
 * Prices are the other half. "$5 and $10" would read as math around "5 and ",
 * so a single `$` only counts when it pairs up the way pandoc pairs them: no
 * space just inside either dollar, and no digit right after the closing one.
 * Anything else is escaped and shows as a dollar sign. An unclosed `$` or `$$`
 * is escaped too, which is also what keeps a formula still being streamed as
 * plain text until its closing delimiter arrives, rather than a red error.
 *
 * Code is left alone: fenced blocks and inline code spans pass through as is.
 */
export function normalizeMath(text: string): string {
    if (!/[$\\]/.test(text)) return text;
    let out = "";
    for (const part of splitFences(text)) out += part.code ? part.text : prose(part.text);
    return out;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Splits off fenced code blocks; an unclosed fence runs to the end. */
function splitFences(text: string): Array<{ code: boolean; text: string }> {
    const lines = text.split(/(?<=\n)/);
    const parts: Array<{ code: boolean; text: string }> = [];
    let buffer = "";
    let fence: string | null = null;
    const flush = (code: boolean) => {
        if (buffer) parts.push({ code, text: buffer });
        buffer = "";
    };
    for (const line of lines) {
        const open = FENCE.exec(line);
        if (fence === null && open) {
            flush(false);
            fence = open[1];
            buffer = line;
        } else if (fence !== null && open && open[1][0] === fence[0] && open[1].length >= fence.length && !line.trim().slice(open[1].length).trim()) {
            buffer += line;
            flush(true);
            fence = null;
        } else {
            buffer += line;
        }
    }
    flush(fence !== null);
    return parts;
}

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

/** The whitespace a line starts with, so a block keeps its list indentation. */
function lineIndent(s: string, at: number) {
    const start = s.lastIndexOf("\n", at - 1) + 1;
    const before = s.slice(start, at);
    return /^\s*$/.test(before) ? before : null;
}

function restOfLineBlank(s: string, from: number) {
    const end = s.indexOf("\n", from);
    return /^\s*$/.test(s.slice(from, end === -1 ? undefined : end));
}

/** Where a delimiter closes without crossing a blank line, or -1. */
function findClose(s: string, delim: string, from: number) {
    const close = s.indexOf(delim, from);
    if (close === -1) return -1;
    return /\n\s*\n/.test(s.slice(from, close)) ? -1 : close;
}

/**
 * `$$inner$$`, as a block when it has its lines to itself, otherwise inline.
 * `start` is where the opening delimiter began in `s`, `end` just past the
 * closing one.
 */
function display(s: string, start: number, end: number, inner: string) {
    const indent = lineIndent(s, start);
    if (indent === null || !restOfLineBlank(s, end)) return `$$${inner}$$`;
    const body = inner.trim().split("\n").map(l => indent + l.trimStart()).join("\n");
    // The indent before the opener is already in the output.
    return `$$\n${body}\n${indent}$$`;
}

function prose(s: string): string {
    let out = "";
    let i = 0;
    while (i < s.length) {
        const c = s[i];

        // Inline code: a run of backticks closed by a run of the same length.
        if (c === "`") {
            let run = 1;
            while (s[i + run] === "`") run++;
            const tick = "`".repeat(run);
            let close = s.indexOf(tick, i + run);
            while (close !== -1 && (s[close + run] === "`" || s[close - 1] === "`")) {
                close = s.indexOf(tick, close + 1);
            }
            if (close === -1) { out += tick; i += run; continue; }
            out += s.slice(i, close + run);
            i = close + run;
            continue;
        }

        if (c === "\\") {
            const next = s[i + 1];
            // `\[` mid-sentence is far more often an escaped bracket than a
            // formula, display math starts its own line.
            if (next === "(" || (next === "[" && lineIndent(s, i) !== null)) {
                const closer = next === "(" ? "\\)" : "\\]";
                const close = findClose(s, closer, i + 2);
                const inner = close === -1 ? "" : s.slice(i + 2, close);
                if (inner.trim()) {
                    out += next === "(" ? `$${inner.trim()}$` : display(s, i, close + 2, inner);
                    i = close + 2;
                    continue;
                }
            }
            // Any other escape, `\$` included, passes through as a pair.
            out += c + (next ?? "");
            i += 2;
            continue;
        }

        if (c === "$" && s[i + 1] === "$") {
            const close = findClose(s, "$$", i + 2);
            const inner = close === -1 ? "" : s.slice(i + 2, close);
            if (inner.trim()) {
                out += display(s, i, close + 2, inner);
                i = close + 2;
            } else {
                out += "\\$\\$";
                i += 2;
            }
            continue;
        }

        if (c === "$") {
            const close = isSpace(s[i + 1]) ? -1 : inlineClose(s, i + 1);
            if (close === -1) {
                out += "\\$";
                i++;
            } else {
                out += s.slice(i, close + 1);
                i = close + 1;
            }
            continue;
        }

        out += c;
        i++;
    }
    return out;
}

/** The `$` closing inline math opened just before `from`, on the same line. */
function inlineClose(s: string, from: number) {
    for (let j = from; j < s.length; j++) {
        const c = s[j];
        if (c === "\n") return -1;
        if (c === "\\") { j++; continue; }
        if (c !== "$") continue;
        if (s[j + 1] === "$") return -1;
        if (!isSpace(s[j - 1]) && !/\d/.test(s[j + 1] ?? "")) return j;
        // A bare `$` can't sit inside a formula, so the opener was a price:
        // "$5, total $x$" would otherwise typeset "5, total $x".
        return -1;
    }
    return -1;
}
