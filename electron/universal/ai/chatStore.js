import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { withCodexMode } from "./prefs.js";
import { sanitizeAttachments } from "./attachments.js";

/**
 * Chats live as one JSON file each under userData/chats, not in electron-store.
 *
 * config.json is already ~27KB and is read and rewritten on ordinary settings
 * changes; transcripts would bloat it and make every unrelated write more
 * expensive. Separate files also mean a corrupt chat loses one conversation
 * rather than every setting in the app.
 */
function chatsDir() {
    const dir = path.join(app.getPath("userData"), "chats");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Every id this store hands out is a randomUUID().
const CHAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids come from the renderer; anything else could path.join out of chats/. */
export const isChatId = (id) => typeof id === "string" && CHAT_ID.test(id);

function chatPath(id) {
    // Thrown rather than returned: every caller already treats a failed read
    // or write as "no such chat", so a bad id lands there too.
    if (!isChatId(id)) throw new Error("Invalid chat id");
    return path.join(chatsDir(), `${id}.json`);
}

/** First line of the opening prompt, trimmed to something list-sized. */
function deriveTitle(prompt) {
    const line = String(prompt ?? "").trim().split("\n")[0].trim();
    if (!line) return "New chat";
    return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

export function createChat({ providerId, model, settings }) {
    const chat = {
        id: randomUUID(),
        title: "New chat",
        providerId,
        model: model ?? null,
        // The provider's own knobs (effort, sandbox) as they stood for this
        // conversation, so reopening it restores the setup it was written with.
        settings: settings ?? {},
        // The provider's own thread id, lets a follow-up resume rather than
        // resend the whole transcript.
        sessionId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
    };
    writeChat(chat);
    return chat;
}

export function readChat(id) {
    try {
        const chat = JSON.parse(fs.readFileSync(chatPath(id), "utf8"));
        if (chat?.providerId === "codex") chat.settings = withCodexMode(chat.settings);
        return chat;
    } catch {
        return null;
    }
}

/**
 * Written beside the real file and renamed over it. writeFileSync truncates
 * first, so a crash or power cut mid-write used to leave an empty or half
 * file, and the whole conversation with it.
 */
export function writeChat(chat) {
    let temp = null;
    try {
        const file = chatPath(chat.id);
        chat.updatedAt = Date.now();
        temp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(chat, null, 2), "utf8");
        fs.renameSync(temp, file);
        return true;
    } catch (err) {
        console.error("Failed to save chat:", err?.message ?? err);
        if (temp) try { fs.unlinkSync(temp); } catch { /* never written */ }
        return false;
    }
}

export function appendMessage(id, message) {
    const chat = readChat(id);
    if (!chat) return null;
    const attachments = sanitizeAttachments(message?.attachments);
    const stored = { ...message };
    if (attachments.length) stored.attachments = attachments;
    else delete stored.attachments;
    chat.messages.push(stored);
    // A prompt that is only a file is named after the file.
    if (chat.messages.length === 1 && message.role === "user") {
        chat.title = deriveTitle(message.content?.trim() ? message.content : attachments[0]?.name);
    }
    writeChat(chat);
    return chat;
}

/** Thinking can run to tens of thousands of tokens; a transcript shouldn't. */
const MAX_STORED_REASONING = 20_000;

/**
 * Replaces the last assistant message, used to commit a streamed answer.
 *
 * `providerId` is the provider the turn ran on. The session id is only kept
 * if the chat still uses that provider: switching mid-answer clears the old
 * thread id, and the finishing turn used to write it straight back, so the
 * next turn resumed a foreign session and failed from then on.
 * `sessionId` null clears the stored id; undefined leaves it alone.
 */
/** Fields describing how an answer was reached, replaced wholesale per turn. */
const TRACE_FIELDS = ["reasoning", "thoughts", "activities", "steps", "hiddenSteps", "plan", "stats", "traceId", "error"];

/** Thinking entries trimmed to a shared budget, so a turn's thinking stays bounded however it's split. */
function boundThoughts(thoughts) {
    let budget = MAX_STORED_REASONING;
    const kept = [];
    for (const thought of thoughts) {
        if (!thought?.text?.trim()) continue;
        if (budget <= 0) break;
        const text = thought.text.length > budget ? thought.text.slice(0, budget) + "\n…" : thought.text;
        budget -= thought.text.length;
        kept.push({ ...thought, text });
    }
    return kept;
}

export function finishAssistantMessage(id, { content, sessionId, providerId, reasoning, thoughts, activities, steps, hiddenSteps, plan, stats, traceId, error }) {
    const chat = readChat(id);
    if (!chat) return null;

    // Kept alongside the answer so reopening a chat shows how it was reached,
    // not just what it concluded. All optional: older files predate them,
    // and most providers expose none of it.
    const trace = {};
    if (reasoning?.trim()) {
        trace.reasoning = reasoning.length > MAX_STORED_REASONING
            ? reasoning.slice(0, MAX_STORED_REASONING) + "\n…"
            : reasoning;
    }
    if (Array.isArray(thoughts)) {
        const kept = boundThoughts(thoughts);
        if (kept.length) trace.thoughts = kept;
    }
    // Older chats saved a flat list of labels; the view still reads those.
    if (activities?.length) trace.activities = activities;
    if (Array.isArray(steps) && steps.length) trace.steps = steps;
    if (hiddenSteps > 0) trace.hiddenSteps = hiddenSteps;
    if (Array.isArray(plan) && plan.length) trace.plan = plan;
    if (stats && typeof stats === "object" && Object.keys(stats).length) trace.stats = stats;
    if (typeof traceId === "string") trace.traceId = traceId;
    // Kept so a failed turn reopens as the failure it was, not a blank answer.
    if (typeof error === "string" && error.trim()) trace.error = error.slice(0, 2000);

    const text = typeof content === "string" ? content : "";
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.role === "assistant") {
        // A rerun must not keep the previous attempt's error, or its steps.
        for (const field of TRACE_FIELDS) delete last[field];
        Object.assign(last, { content: text }, trace);
    } else {
        chat.messages.push({ role: "assistant", content: text, ...trace });
    }
    const sameProvider = !providerId || chat.providerId === providerId;
    if (sessionId !== undefined && sameProvider) chat.sessionId = sessionId || null;
    writeChat(chat);
    return chat;
}

/**
 * Drops the trailing assistant turn so the same prompt can be asked again.
 *
 * For stateless providers this genuinely regenerates: the transcript sent
 * upstream no longer contains the discarded answer. Session-based CLIs still
 * hold it in their own thread, so there a rerun reads as "ask that again"
 * rather than a clean retry, which is the closest they offer without throwing
 * away the conversation's context.
 */
export function trimForRerun(id) {
    const chat = readChat(id);
    if (!chat) return null;
    while (chat.messages.length && chat.messages[chat.messages.length - 1].role === "assistant") {
        chat.messages.pop();
    }
    writeChat(chat);
    return chat;
}

/**
 * Remembers the provider/model/controls a conversation is using.
 *
 * Switching model mid-thread is a deliberate choice, and reopening the chat
 * later should land you back on it rather than on the global default.
 */
export function updateChatConfig(id, { providerId, model, settings }) {
    const chat = readChat(id);
    if (!chat) return null;

    // A provider swap invalidates the old provider's thread id, resuming a
    // Claude session against Codex would either fail or reply out of context.
    // Compared before the assignment, or it could never be true.
    const switchedProvider = providerId !== undefined && providerId !== chat.providerId;

    if (providerId !== undefined) chat.providerId = providerId;
    if (model !== undefined) chat.model = model;
    if (settings !== undefined) chat.settings = { ...(chat.settings ?? {}), ...settings };
    if (switchedProvider) chat.sessionId = null;

    writeChat(chat);
    return chat;
}

/** Sidebar index: metadata only, newest first, transcripts are not loaded. */
export function listChats() {
    let files = [];
    try {
        files = fs.readdirSync(chatsDir()).filter(f => f.endsWith(".json"));
    } catch {
        return [];
    }
    const chats = [];
    for (const file of files) {
        try {
            const chat = JSON.parse(fs.readFileSync(path.join(chatsDir(), file), "utf8"));
            chats.push({
                id: chat.id,
                title: chat.title,
                providerId: chat.providerId,
                model: chat.model ?? null,
                updatedAt: chat.updatedAt ?? 0,
                messageCount: chat.messages?.length ?? 0,
            });
        } catch { /* skip an unreadable chat rather than failing the list */ }
    }
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function renameChat(id, title) {
    const chat = readChat(id);
    if (!chat) return null;
    const trimmed = String(title ?? "").trim();
    // An empty rename falls back to the opening prompt rather than a blank row.
    chat.title = trimmed ? trimmed.slice(0, 80) : deriveTitle(chat.messages[0]?.content?.trim() ? chat.messages[0].content : chat.messages[0]?.attachments?.[0]?.name);
    writeChat(chat);
    return chat;
}

/** Returns how many were removed, so the caller can report it honestly. */
export function deleteAllChats() {
    let removed = 0;
    try {
        for (const file of fs.readdirSync(chatsDir())) {
            if (!file.endsWith(".json")) continue;
            try { fs.unlinkSync(path.join(chatsDir(), file)); removed++; } catch { /* skip */ }
        }
    } catch { /* no directory yet */ }
    return removed;
}

export function deleteChat(id) {
    try {
        fs.unlinkSync(chatPath(id));
        return true;
    } catch {
        return false;
    }
}
