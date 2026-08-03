import { ipcMain } from "electron";
import { describeProviders, getProvider } from "../universal/ai/provider.js";
import "../universal/ai/claudeCode.js"; // registers the provider

// One controller per in-flight turn so a request can be cancelled individually.
const inFlight = new Map();

/**
 * AI channels are deliberately narrow and named, matching the rest of the
 * preload surface — a prompt goes out, chunks come back. Credentials never
 * cross into the renderer; the main process attaches them.
 */
export function registerAiIpc({ mainWindow }) {
    ipcMain.handle("ai-list-providers", async () => {
        try {
            return await describeProviders();
        } catch (err) {
            console.error("ai-list-providers failed:", err?.message ?? err);
            return [];
        }
    });

    ipcMain.handle("ai-send", async (event, request) => {
        const { requestId, providerId, prompt, sessionId, model, settings } = request ?? {};
        if (!requestId || !providerId || !prompt?.trim()) {
            return { ok: false, detail: "Missing request id, provider, or prompt" };
        }

        const provider = getProvider(providerId);
        if (!provider) return { ok: false, detail: `Unknown provider: ${providerId}` };

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
                    prompt, sessionId, model, settings, signal: controller.signal,
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
