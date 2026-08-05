import { app, ipcMain } from "electron";
import { describeProviders, getProvider, providerModels } from "../universal/ai/provider.js";
import {
    createChat, readChat, listChats, deleteChat,
    appendMessage, finishAssistantMessage, updateChatConfig, trimForRerun,
    renameChat, deleteAllChats,
} from "../universal/ai/chatStore.js";
import { keyStatus, setKey, clearKey, encryptionAvailable } from "../universal/ai/credentials.js";
import { getPrefs, setPrefs } from "../universal/ai/prefs.js";
import { workspaceDir, defaultWorkspace } from "../universal/ai/workspace.js";
import { draftCommand } from "../universal/ai/commandDraft.js";
// Importing an adapter registers it.
import "../universal/ai/claudeCode.js";
import "../universal/ai/openaiCompatible.js";
import "../universal/ai/gemini.js";
import "../universal/ai/codexCli.js";

// One controller per in-flight turn so a request can be cancelled individually.
const inFlight = new Map();

/**
 * AI channels are deliberately narrow and named, matching the rest of the
 * preload surface — a prompt goes out, chunks come back. Credentials never
 * cross into the renderer; the main process attaches them.
 */
export function registerAiIpc({ mainWindow, appStates }) {
    ipcMain.handle("ai-list-providers", async () => {
        try {
            return await describeProviders();
        } catch (err) {
            console.error("ai-list-providers failed:", err?.message ?? err);
            return [];
        }
    });

    // Fetched per provider so opening the view doesn't wait on every CLI at
    // once. Adapters cache their own catalogue, so this is slow only once.
    ipcMain.handle("ai-provider-models", async (_, id) => {
        try {
            return await providerModels(id);
        } catch {
            return [];
        }
    });

    ipcMain.handle("ai-send", async (event, request) => {
        const { requestId, providerId, prompt, sessionId, chatId, model, settings } = request ?? {};
        if (!requestId || !providerId || !prompt?.trim()) {
            return { ok: false, detail: "Missing request id, provider, or prompt" };
        }

        const provider = getProvider(providerId);
        if (!provider) return { ok: false, detail: `Unknown provider: ${providerId}` };

        // Stateless providers (the API-key ones) have no thread to resume, so
        // they need the transcript. Read it here rather than shipping it over
        // IPC on every turn — the main process already owns the chat files.
        let history = [];
        if (chatId) {
            const stored = readChat(chatId);
            history = (stored?.messages ?? []).filter(m => m.content?.trim());
        }

        const controller = new AbortController();
        // The turn is owned here, not by the renderer: text accumulates in this
        // process and is written to the chat file when it completes. Leaving the
        // AI view, or hiding the launcher, no longer costs you the answer — the
        // renderer is a viewer, not the thing holding the result.
        const turn = { controller, chatId: chatId ?? null, text: "", saved: false };
        inFlight.set(requestId, turn);

        const post = (chunk) => {
            const target = event.sender.isDestroyed() ? mainWindow?.webContents : event.sender;
            if (target && !target.isDestroyed()) target.send("ai-chunk", { requestId, ...chunk });
        };

        const persist = (sessionId) => {
            if (turn.saved || !turn.chatId) return;
            turn.saved = true;
            // A cancelled or failed turn still commits whatever arrived.
            finishAssistantMessage(turn.chatId, { content: turn.text, sessionId });
        };

        // Deliberately not awaited: the handler returns immediately so the
        // renderer isn't blocked for the length of a multi-minute answer.
        (async () => {
            try {
                for await (const chunk of provider.send({
                    prompt, sessionId, history, model, settings, signal: controller.signal,
                })) {
                    if (chunk.type === "text") turn.text += chunk.text;
                    // Saved before the renderer is told, so a "done" always
                    // means the transcript on disk is already current.
                    if (chunk.type === "done") persist(chunk.sessionId);
                    post(chunk);
                }
            } catch (err) {
                post({ type: "error", message: err?.message ?? String(err) });
                persist(undefined);
                post({ type: "done" });
            } finally {
                persist(undefined);
                inFlight.delete(requestId);
            }
        })();

        return { ok: true };
    });

    /**
     * Lets a returning view pick a stream back up. The window can be hidden or
     * the route left entirely while an answer arrives, so on reopening a chat
     * the renderer asks whether one is still running for it.
     */
    ipcMain.handle("ai-active-turn", (_, id) => {
        for (const [requestId, turn] of inFlight) {
            if (turn.chatId && turn.chatId === id) {
                return { requestId, text: turn.text };
            }
        }
        return null;
    });

    /**
     * Which conversations have a turn running. Several can be in flight at once
     * — each is owned here, not by the view — so the list marks them rather
     * than the UI assuming only the open one can be busy.
     */
    ipcMain.handle("ai-active-turns", () => {
        const ids = [];
        for (const turn of inFlight.values()) {
            if (turn.chatId && !ids.includes(turn.chatId)) ids.push(turn.chatId);
        }
        return ids;
    });

    /**
     * Drafts a command from a description. Returns it for review — saving is a
     * separate, deliberate step, and nothing drafted here is ever executed.
     */
    ipcMain.handle("ai-draft-command", async (_, request) => {
        try {
            return await draftCommand(request ?? {});
        } catch (err) {
            return { ok: false, detail: err?.message ?? "Drafting failed." };
        }
    });

    // --- credentials -------------------------------------------------------
    // Deliberately no "get key" channel. The renderer learns only whether a key
    // exists; the value stays in the main process and is attached there.
    ipcMain.handle("ai-key-status", () => ({
        encryptionAvailable: encryptionAvailable(),
        keys: keyStatus(),
    }));
    ipcMain.handle("ai-set-key", (_, providerId, key) => setKey(providerId, key));
    ipcMain.handle("ai-clear-key", (_, providerId) => clearKey(providerId));

    // --- preferences -------------------------------------------------------
    ipcMain.handle("ai-get-prefs", () => getPrefs());
    ipcMain.handle("ai-set-prefs", (_, patch) => setPrefs(patch));
    // Where the CLI providers actually run — resolved, not just the pref.
    ipcMain.handle("ai-workspace", () => ({
        path: workspaceDir(),
        isDefault: !getPrefs().workspace,
        defaultPath: defaultWorkspace(),
    }));

    // --- chats -------------------------------------------------------------
    ipcMain.handle("ai-list-chats", () => listChats());
    ipcMain.handle("ai-get-chat", (_, id) => readChat(id));
    ipcMain.handle("ai-create-chat", (_, opts) => createChat(opts ?? {}));
    ipcMain.handle("ai-delete-chat", (_, id) => deleteChat(id));
    ipcMain.handle("ai-delete-all-chats", () => deleteAllChats());
    ipcMain.handle("ai-rename-chat", (_, id, title) => renameChat(id, title));
    ipcMain.handle("ai-append-message", (_, id, message) => appendMessage(id, message));
    ipcMain.handle("ai-finish-message", (_, id, payload) => finishAssistantMessage(id, payload ?? {}));
    ipcMain.handle("ai-update-chat-config", (_, id, config) => updateChatConfig(id, config ?? {}));
    ipcMain.handle("ai-trim-for-rerun", (_, id) => trimForRerun(id));

    // While the AI view is open the launcher must not hide on blur, or a
    // streaming answer disappears the moment you click elsewhere.
    ipcMain.on("ai-set-mode", (_, active) => {
        appStates.aiMode = Boolean(active);
    });

    ipcMain.handle("ai-cancel", (_, requestId) => {
        const turn = inFlight.get(requestId);
        if (!turn) return false;
        turn.controller.abort();
        // Left in the map so the generator's own teardown can still persist
        // whatever text arrived before the abort landed.
        return true;
    });

    // Turns outlive the view, but not the app. Quitting is the one point where
    // abandoning them is right — there is nothing left to write into.
    app.on("before-quit", () => {
        for (const turn of inFlight.values()) turn.controller.abort();
        inFlight.clear();
    });
}
