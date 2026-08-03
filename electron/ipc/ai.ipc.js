import { ipcMain } from "electron";
import { describeProviders, getProvider } from "../universal/ai/provider.js";
import {
    createChat, readChat, listChats, deleteChat,
    appendMessage, finishAssistantMessage, updateChatConfig, trimForRerun,
} from "../universal/ai/chatStore.js";
import { keyStatus, setKey, clearKey, encryptionAvailable } from "../universal/ai/credentials.js";
import { getPrefs, setPrefs } from "../universal/ai/prefs.js";
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

        // Reply to whoever asked — the AI window, not necessarily the launcher.
        const sender = event.sender;
        const controller = new AbortController();
        inFlight.set(requestId, controller);

        const post = (chunk) => {
            if (!sender.isDestroyed()) sender.send("ai-chunk", { requestId, ...chunk });
        };

        // Deliberately not awaited: the handler returns immediately so the
        // renderer isn't blocked for the length of a multi-minute answer.
        (async () => {
            try {
                for await (const chunk of provider.send({
                    prompt, sessionId, history, model, settings, signal: controller.signal,
                })) {
                    post(chunk);
                }
            } catch (err) {
                post({ type: "error", message: err?.message ?? String(err) });
                post({ type: "done" });
            } finally {
                inFlight.delete(requestId);
            }
        })();

        return { ok: true };
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

    // --- chats -------------------------------------------------------------
    ipcMain.handle("ai-list-chats", () => listChats());
    ipcMain.handle("ai-get-chat", (_, id) => readChat(id));
    ipcMain.handle("ai-create-chat", (_, opts) => createChat(opts ?? {}));
    ipcMain.handle("ai-delete-chat", (_, id) => deleteChat(id));
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
        const controller = inFlight.get(requestId);
        if (!controller) return false;
        controller.abort();
        inFlight.delete(requestId);
        return true;
    });

    // Nothing should outlive the window that asked for it.
    mainWindow?.on("closed", () => {
        for (const controller of inFlight.values()) controller.abort();
        inFlight.clear();
    });
}
