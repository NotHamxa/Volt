import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import { app } from "electron";

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

const chatPath = (id) => path.join(chatsDir(), `${id}.json`);

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
        // The provider's own thread id — lets a follow-up resume rather than
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
        return JSON.parse(fs.readFileSync(chatPath(id), "utf8"));
    } catch {
        return null;
    }
}

export function writeChat(chat) {
    try {
        chat.updatedAt = Date.now();
        fs.writeFileSync(chatPath(chat.id), JSON.stringify(chat, null, 2), "utf8");
        return true;
    } catch (err) {
        console.error("Failed to save chat:", err?.message ?? err);
        return false;
    }
}

export function appendMessage(id, message) {
    const chat = readChat(id);
    if (!chat) return null;
    chat.messages.push(message);
    if (chat.messages.length === 1 && message.role === "user") {
        chat.title = deriveTitle(message.content);
    }
    writeChat(chat);
    return chat;
}

/** Replaces the last assistant message — used to commit a streamed answer. */
export function finishAssistantMessage(id, { content, sessionId }) {
    const chat = readChat(id);
    if (!chat) return null;
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.role === "assistant") last.content = content;
    else chat.messages.push({ role: "assistant", content });
    if (sessionId) chat.sessionId = sessionId;
    writeChat(chat);
    return chat;
}

/**
 * Drops the trailing assistant turn so the same prompt can be asked again.
 *
 * For stateless providers this genuinely regenerates: the transcript sent
 * upstream no longer contains the discarded answer. Session-based CLIs still
 * hold it in their own thread, so there a rerun reads as "ask that again"
 * rather than a clean retry — which is the closest they offer without throwing
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

    // A provider swap invalidates the old provider's thread id — resuming a
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

/** Sidebar index: metadata only, newest first — transcripts are not loaded. */
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
    chat.title = trimmed ? trimmed.slice(0, 80) : deriveTitle(chat.messages[0]?.content);
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
