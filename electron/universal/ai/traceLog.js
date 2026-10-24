import fs from "fs";
import path from "path";
import { app } from "electron";

/**
 * A raw record of each turn: every event the CLI sent, and its stderr, one
 * JSON object per line, under userData/ai-traces.
 *
 * The trace in the chat is a summary, readable, and lossy on purpose. When a
 * CLI misbehaves the reason is usually in what the summary left out (Codex's
 * sandbox refusals only ever appeared on stderr), and this is where to look.
 *
 * Files are named `<chatId>--<turnId>.jsonl`, so deleting a conversation can
 * take its traces with it. Only the newest few dozen are kept.
 */

const KEEP = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isTraceId = (id) => typeof id === "string" && UUID.test(id);

function traceDir() {
    const dir = path.join(app.getPath("userData"), "ai-traces");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function files() {
    try {
        return fs.readdirSync(traceDir()).filter(f => f.endsWith(".jsonl"));
    } catch {
        return [];
    }
}

function prune() {
    const dir = traceDir();
    const dated = files().map(name => {
        try {
            return { name, mtime: fs.statSync(path.join(dir, name)).mtimeMs };
        } catch {
            return { name, mtime: 0 };
        }
    });
    dated.sort((a, b) => b.mtime - a.mtime);
    for (const { name } of dated.slice(KEEP - 1)) {
        try { fs.unlinkSync(path.join(dir, name)); } catch { /* in use or gone */ }
    }
}

/** The file for a turn, or null when it has been pruned or never existed. */
export function traceFile(turnId) {
    if (!isTraceId(turnId)) return null;
    const name = files().find(f => f.endsWith(`--${turnId}.jsonl`));
    return name ? path.join(traceDir(), name) : null;
}

/**
 * Starts a turn's log. Writing never throws: a trace is a diagnostic, and a
 * full disk mustn't cost the answer.
 */
export function openTrace(turnId, chatId, header) {
    const noop = { write() {}, close() {} };
    if (!isTraceId(turnId)) return noop;
    let stream;
    try {
        prune();
        const owner = UUID.test(chatId ?? "") ? chatId : "none";
        stream = fs.createWriteStream(path.join(traceDir(), `${owner}--${turnId}.jsonl`), { flags: "a" });
    } catch {
        return noop;
    }
    stream.on("error", () => {});
    const line = (entry) => {
        if (!stream.writable) return;
        try {
            stream.write(`${JSON.stringify({ t: Date.now(), ...entry })}\n`);
        } catch { /* unserialisable event: skipped */ }
    };
    line({ turn: header });
    return {
        write: (event) => line({ event }),
        close: () => { try { stream.end(); } catch { /* already closed */ } },
    };
}

/** Removes a conversation's traces, or every trace when `chatId` is null. */
export function deleteTraces(chatId) {
    const dir = traceDir();
    for (const name of files()) {
        if (chatId && !name.startsWith(`${chatId}--`)) continue;
        try { fs.unlinkSync(path.join(dir, name)); } catch { /* in use or gone */ }
    }
}
