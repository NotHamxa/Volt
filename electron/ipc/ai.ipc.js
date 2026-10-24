import { randomUUID } from "node:crypto";
import { app, ipcMain, shell } from "electron";
import { describeProviders, getProvider, providerModels } from "../universal/ai/provider.js";
import {
    createChat, readChat, listChats, deleteChat,
    appendMessage, finishAssistantMessage, updateChatConfig, trimForRerun,
    renameChat, deleteAllChats, isChatId,
} from "../universal/ai/chatStore.js";
import { keyStatus, setKey, clearKey, encryptionAvailable } from "../universal/ai/credentials.js";
import { getPrefs, setPrefs } from "../universal/ai/prefs.js";
import { workspaceDir, defaultWorkspace } from "../universal/ai/workspace.js";
import { draftCommand } from "../universal/ai/commandDraft.js";
import { killAllTrees } from "../universal/ai/cliProcess.js";
import { openTrace, traceFile, deleteTraces } from "../universal/ai/traceLog.js";
import {
    saveAttachments, resolveAttachments, hasContent, deleteChatAttachments, deleteAllAttachments, imagePreview,
} from "../universal/ai/attachments.js";
// Importing an adapter registers it.
import "../universal/ai/claudeCode.js";
import "../universal/ai/openaiCompatible.js";
import "../universal/ai/gemini.js";
import "../universal/ai/codexCli.js";

// One controller per in-flight turn so a request can be cancelled individually.
const inFlight = new Map();

/**
 * A stopped turn's provider, still winding down, by chat id. Stop is answered
 * at once, but the next turn on the same thread waits for this, two CLIs
 * writing one session at the same time is how threads get corrupted.
 */
const closing = new Map();
/** How long a new turn waits on the last one's teardown before going anyway. */
const TEARDOWN_WAIT_MS = 5000;

const ABORTED = Symbol("aborted");

/**
 * Tools approved with "Allow for this chat", per chat id. Memory only: a
 * standing grant should not outlive the app session it was given in.
 */
const chatGrants = new Map();

/** An unanswered approval is refused after this, nobody is coming back. */
const PERMISSION_TIMEOUT_MS = 5 * 60_000;
/** Once the AI view is closed, a pending approval gets this long instead. */
const PERMISSION_AWAY_MS = 60_000;

const DECISIONS = new Set(["allow", "allow-chat", "deny"]);

/** Steps kept per turn. An agentic turn can run hundreds; the oldest go first. */
const MAX_STEPS = 200;

/**
 * AI channels are deliberately narrow and named, matching the rest of the
 * preload surface, a prompt goes out, chunks come back. Credentials never
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
        const { requestId, providerId, chatId, model, settings } = request ?? {};
        const prompt = typeof request?.prompt === "string" ? request.prompt : "";
        const attachments = resolveAttachments(request?.attachments);
        if (!requestId || !providerId || (!prompt.trim() && !attachments.length)) {
            return { ok: false, detail: "Missing request id, provider, or prompt" };
        }
        if (chatId != null && !isChatId(chatId)) return { ok: false, detail: "Invalid chat id" };

        const provider = getProvider(providerId);
        if (!provider) return { ok: false, detail: `Unknown provider: ${providerId}` };

        // Stateless providers (the API-key ones) have no thread to resume, so
        // they need the transcript. Read it here rather than shipping it over
        // IPC on every turn, the main process already owns the chat files.
        // The thread id comes from the file too: the view's copy of the chat
        // can predate a provider switch that cleared it.
        let history = [];
        let sessionId = request.sessionId ?? null;
        if (chatId) {
            const stored = readChat(chatId);
            history = (stored?.messages ?? []).filter(hasContent);
            if (stored) sessionId = stored.providerId === providerId ? (stored.sessionId ?? null) : null;
        }

        const controller = new AbortController();
        // The turn is owned here, not by the renderer: text accumulates in this
        // process and is written to the chat file when it completes. Leaving the
        // AI view, or hiding the launcher, no longer costs you the answer, the
        // renderer is a viewer, not the thing holding the result.
        // Steps, thoughts and the plan are saved with the answer when the
        // turn ends; until then they live here, so a view that reattaches
        // mid-answer gets the trail so far rather than an empty one.
        const turn = {
            controller,
            chatId: chatId ?? null,
            providerId,
            // The thread id as soon as the provider knows it, so a turn
            // stopped before its own "done" still saves it.
            sessionId: undefined,
            text: "",
            // Thinking, one entry per stretch of it. A turn that thinks,
            // runs a tool and thinks again has two, each placed where it
            // happened in the answer rather than pooled at the top.
            thoughts: [],
            // What arrived last, text, a step, or thinking, so a new
            // stretch of either starts where the previous one ended.
            lastKind: null,
            // Orders steps and thoughts that sit at the same point in the text.
            seq: 0,
            // The work the turn did, in order. Merged by id here, a step is
            // reported as it starts and again as it ends, and timed here, so
            // no adapter has to keep a clock.
            steps: [],
            stepIndex: new Map(),
            // Steps that fell off the front of the list on a very long turn.
            hiddenSteps: 0,
            plan: null,
            stats: {},
            startedAt: Date.now(),
            error: "",
            // Approvals waiting on the user, by permission id.
            permissions: new Map(),
            saved: false,
        };
        inFlight.set(requestId, turn);

        const log = openTrace(requestId, chatId, {
            providerId, model: model ?? null, settings: settings ?? {}, sessionId, workspace: workspaceDir(), prompt,
            attachments: attachments.map(a => ({ name: a.name, path: a.path, kind: a.kind, size: a.size })),
        });

        /** Adds a step or folds an update into the one it belongs to. */
        const upsertStep = (patch) => {
            const now = Date.now();
            // An adapter's undefined (no parent, no detail yet) mustn't erase
            // what an earlier report said.
            const fields = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
            let step = turn.stepIndex.get(fields.id);
            if (!step) {
                // `at` is how much of the answer had been written when the
                // step began: the view draws it there, between the text
                // before and after it, instead of above the whole answer.
                step = { status: "running", startedAt: now, at: turn.text.length, seq: ++turn.seq, ...fields };
                // A subagent's calls sit under their parent and don't
                // interrupt the answer.
                if (!step.parentId) noteKind("step");
                turn.stepIndex.set(step.id, step);
                turn.steps.push(step);
                if (turn.steps.length > MAX_STEPS) {
                    turn.stepIndex.delete(turn.steps.shift().id);
                    turn.hiddenSteps++;
                }
            } else {
                Object.assign(step, fields);
            }
            if (step.status !== "running" && !step.endedAt) step.endedAt = now;
            return step;
        };

        /** Ends the stretch of thinking in progress, if there is one. */
        const endThought = (now = Date.now()) => {
            const thought = turn.thoughts.at(-1);
            if (!thought || thought.endedAt) return;
            thought.endedAt = now;
            post({ type: "thought", thought: { ...thought, text: undefined } });
        };

        const noteKind = (kind) => {
            if (kind !== "thought") endThought();
            turn.lastKind = kind;
        };

        /**
         * Thinking that follows text or a step starts a new entry, placed at
         * that point; thinking that follows thinking carries on the last one.
         */
        const addReasoning = (text) => {
            let thought = turn.lastKind === "thought" ? turn.thoughts.at(-1) : null;
            if (!thought) {
                noteKind("thought");
                thought = { id: `thought-${turn.thoughts.length + 1}`, at: turn.text.length, seq: ++turn.seq, startedAt: Date.now(), text: "" };
                turn.thoughts.push(thought);
                post({ type: "thought", thought: { ...thought, text: undefined } });
            }
            thought.text += text;
            post({ type: "reasoning", thoughtId: thought.id, text });
        };

        /**
         * Text resuming after a step or thinking is a new paragraph. Joined
         * as it came, "Let me check." and the answer after the tool call
         * ran together into one sentence.
         */
        const addText = (text) => {
            const resumed = turn.lastKind && turn.lastKind !== "text";
            noteKind("text");
            if (resumed && turn.text && !/\n\s*$/.test(turn.text) && !/^\s*\n/.test(text)) text = `\n\n${text}`;
            turn.text += text;
            post({ type: "text", text });
        };

        /**
         * Closes the books on a turn: anything still marked running was cut
         * off, a stop, a crash, rather than finished, and the clock is ours
         * so every provider's duration means the same thing.
         */
        const settleTurn = () => {
            const now = Date.now();
            for (const step of turn.steps) {
                if (step.status === "running") Object.assign(step, { status: "stopped", endedAt: now });
            }
            endThought(now);
            turn.stats = { ...turn.stats, durationMs: now - turn.startedAt };
        };

        const post = (chunk) => {
            const target = event.sender.isDestroyed() ? mainWindow?.webContents : event.sender;
            if (target && !target.isDestroyed()) target.send("ai-chunk", { requestId, ...chunk });
        };

        /**
         * Asks the person at the keyboard whether a tool may run. The prompt
         * appears inline in the AI view; whatever happens to the view or the
         * turn, this settles, a tool call is never left waiting forever, and
         * silence is a refusal.
         */
        const requestPermission = ({ toolName, title, detail, signal }) => new Promise((resolve) => {
            const grants = turn.chatId ? chatGrants.get(turn.chatId) : null;
            if (grants?.has(toolName)) { resolve("allow"); return; }
            if (controller.signal.aborted || signal?.aborted) { resolve("deny"); return; }

            const permissionId = randomUUID();
            const pending = { permissionId, toolName, title, detail, awayTimer: null };
            const settle = (decision) => {
                if (!turn.permissions.has(permissionId)) return;
                turn.permissions.delete(permissionId);
                clearTimeout(timer);
                clearTimeout(pending.awayTimer);
                controller.signal.removeEventListener("abort", refuse);
                signal?.removeEventListener("abort", refuse);
                if (decision === "allow-chat" && turn.chatId) {
                    if (!chatGrants.has(turn.chatId)) chatGrants.set(turn.chatId, new Set());
                    chatGrants.get(turn.chatId).add(toolName);
                }
                post({ type: "permission-resolved", permissionId, decision });
                resolve(decision);
            };
            const refuse = () => settle("deny");
            const timer = setTimeout(refuse, PERMISSION_TIMEOUT_MS);
            controller.signal.addEventListener("abort", refuse, { once: true });
            signal?.addEventListener("abort", refuse, { once: true });

            pending.settle = settle;
            turn.permissions.set(permissionId, pending);
            // Asked while the view is already closed: the shorter clock.
            if (!appStates.aiMode) pending.awayTimer = setTimeout(refuse, PERMISSION_AWAY_MS);
            post({ type: "permission", permissionId, toolName, title, detail });
        });

        const persist = (sessionId) => {
            if (turn.saved || !turn.chatId) return;
            turn.saved = true;
            // A cancelled or failed turn still commits whatever arrived, and
            // the error with it, reopening showed a blank answer otherwise.
            finishAssistantMessage(turn.chatId, {
                content: turn.text,
                sessionId,
                providerId: turn.providerId,
                thoughts: turn.thoughts,
                steps: turn.steps,
                hiddenSteps: turn.hiddenSteps,
                plan: turn.plan,
                stats: turn.stats,
                traceId: requestId,
                error: turn.error || undefined,
            });
        };

        const noteError = (message) => {
            turn.error = turn.error ? `${turn.error}\n${message}` : String(message ?? "");
        };

        // Deliberately not awaited: the handler returns immediately so the
        // renderer isn't blocked for the length of a multi-minute answer.
        (async () => {
            let finished = false;
            const finish = (sessionId) => {
                settleTurn();
                // Steps cut off by the stop, and the final clock, go out
                // before "done" so the view never shows a spinner that the
                // saved answer doesn't have.
                for (const step of turn.steps) if (step.status === "stopped") post({ type: "step", step });
                post({ type: "stats", stats: turn.stats });
                // Saved before the renderer is told, so a "done" always
                // means the transcript on disk is already current.
                persist(sessionId);
                finished = true;
            };
            // Resolves on Stop. Racing every read against it is what makes
            // Stop immediate: a provider can take seconds to notice an abort
            // (Codex asks its turn to end and waits; a CLI's pipes stay open
            // until everything it started has died), and the turn used to
            // keep streaming until it did.
            const stopped = new Promise((resolve) => {
                if (controller.signal.aborted) resolve(ABORTED);
                else controller.signal.addEventListener("abort", () => resolve(ABORTED), { once: true });
            });
            try {
                const previous = turn.chatId ? closing.get(turn.chatId) : null;
                if (previous) await Promise.race([previous, new Promise(r => setTimeout(r, TEARDOWN_WAIT_MS))]);

                const chunks = provider.send({
                    prompt, attachments, sessionId, history, model, settings, signal: controller.signal, requestPermission,
                    trace: log.write,
                })[Symbol.asyncIterator]();
                while (true) {
                    const pending = chunks.next();
                    const next = await Promise.race([pending, stopped]);
                    if (next === ABORTED) {
                        // Whatever the provider says from here on is not
                        // shown or saved; it is only left to clean up.
                        pending.catch(() => {});
                        const teardown = Promise.resolve(chunks.return?.()).catch(() => {});
                        if (turn.chatId) {
                            closing.set(turn.chatId, teardown);
                            teardown.then(() => {
                                if (closing.get(turn.chatId) === teardown) closing.delete(turn.chatId);
                            });
                        }
                        break;
                    }
                    if (next.done) break;
                    const chunk = next.value;
                    if (chunk.type === "session") {
                        if (chunk.sessionId) turn.sessionId = chunk.sessionId;
                        continue;
                    }
                    // Posted by the helpers, which also place them in the turn.
                    if (chunk.type === "text") {
                        if (chunk.text) addText(chunk.text);
                        continue;
                    }
                    if (chunk.type === "reasoning") {
                        if (chunk.text) addReasoning(chunk.text);
                        continue;
                    }
                    if (chunk.type === "error") noteError(chunk.message);
                    // The view gets the merged step, not the adapter's patch.
                    if (chunk.type === "step" && chunk.step?.id) {
                        post({ type: "step", step: upsertStep(chunk.step) });
                        continue;
                    }
                    if (chunk.type === "plan") {
                        turn.plan = Array.isArray(chunk.items) ? chunk.items : null;
                    }
                    if (chunk.type === "stats") {
                        turn.stats = { ...turn.stats, ...chunk.stats };
                        post({ type: "stats", stats: turn.stats });
                        continue;
                    }
                    if (chunk.type === "done") finish(chunk.sessionId !== undefined ? chunk.sessionId : turn.sessionId);
                    post(chunk);
                }
            } catch (err) {
                const message = err?.message ?? String(err);
                log.write({ error: message });
                noteError(message);
                post({ type: "error", message });
            } finally {
                for (const pending of turn.permissions.values()) pending.settle("deny");
                // An adapter that stops without a "done" would otherwise leave
                // the view spinning forever.
                if (!finished) {
                    finish(turn.sessionId);
                    post({ type: "done" });
                }
                inFlight.delete(requestId);
                log.close();
            }
        })();

        return { ok: true };
    });

    /** The view's answer to an approval prompt. */
    ipcMain.handle("ai-permission-respond", (_, requestId, permissionId, decision) => {
        const pending = inFlight.get(requestId)?.permissions.get(permissionId);
        if (!pending || !DECISIONS.has(decision)) return false;
        pending.settle(decision);
        return true;
    });

    /**
     * Lets a returning view pick a stream back up. The window can be hidden or
     * the route left entirely while an answer arrives, so on reopening a chat
     * the renderer asks whether one is still running for it.
     */
    ipcMain.handle("ai-active-turn", (_, id) => {
        for (const [requestId, turn] of inFlight) {
            if (turn.chatId && turn.chatId === id) {
                return {
                    requestId,
                    text: turn.text,
                    thoughts: turn.thoughts,
                    steps: turn.steps,
                    hiddenSteps: turn.hiddenSteps,
                    plan: turn.plan,
                    stats: turn.stats,
                    // Still waiting on an answer from whoever left the view.
                    permissions: [...turn.permissions.values()].map(p => ({
                        permissionId: p.permissionId,
                        toolName: p.toolName,
                        title: p.title,
                        detail: p.detail,
                    })),
                };
            }
        }
        return null;
    });

    /**
     * Which conversations have a turn running. Several can be in flight at once
     *, each is owned here, not by the view, so the list marks them rather
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
     * Drafts a command from a description. Returns it for review, saving is a
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
    // Where the CLI providers actually run, resolved, not just the pref.
    ipcMain.handle("ai-workspace", () => ({
        path: workspaceDir(),
        isDefault: !getPrefs().workspace,
        defaultPath: defaultWorkspace(),
    }));

    // --- chats -------------------------------------------------------------
    // Ids are checked here as well as in the store: they come from the
    // renderer and become file paths.
    const withChat = (fallback, fn) => (_, id, ...rest) => (isChatId(id) ? fn(id, ...rest) : fallback);

    ipcMain.handle("ai-list-chats", () => listChats());
    ipcMain.handle("ai-get-chat", withChat(null, (id) => readChat(id)));
    ipcMain.handle("ai-create-chat", (_, opts) => createChat(opts ?? {}));
    ipcMain.handle("ai-delete-chat", withChat(false, (id) => {
        chatGrants.delete(id);
        deleteTraces(id);
        deleteChatAttachments(id);
        return deleteChat(id);
    }));
    ipcMain.handle("ai-delete-all-chats", () => {
        chatGrants.clear();
        deleteTraces(null);
        deleteAllAttachments();
        return deleteAllChats();
    });

    // Opens a turn's raw log in the default viewer for .jsonl. False when it
    // has been pruned, which the view reports rather than failing silently.
    ipcMain.handle("ai-open-trace", async (_, turnId) => {
        const file = traceFile(turnId);
        if (!file) return false;
        return (await shell.openPath(file)) === "";
    });
    // Pasted data is written under the chat; files on disk are referenced.
    ipcMain.handle("ai-save-attachments", withChat([], (id, items) => saveAttachments(id, items)));

    /**
     * Opens a file attached to a message. Only one the chat really has, and
     * only images and text open directly, an attached .exe is shown in its
     * folder rather than run.
     */
    /** Only files the chat really has are opened or read. */
    const findAttachment = (chatId, file) => readChat(chatId)?.messages
        ?.flatMap(m => m.attachments ?? [])
        .find(a => a.path === file) ?? null;

    ipcMain.handle("ai-open-attachment", withChat(false, async (id, file) => {
        const attachment = findAttachment(id, file);
        if (!attachment) return false;
        if (attachment.kind === "image" || attachment.kind === "text") {
            return (await shell.openPath(attachment.path)) === "";
        }
        shell.showItemInFolder(attachment.path);
        return true;
    }));

    // Thumbnails and the full-size preview of an attached image.
    ipcMain.handle("ai-attachment-image", withChat(null, (id, file, maxSize) => {
        const attachment = findAttachment(id, file);
        return attachment?.kind === "image" ? imagePreview(attachment.path, maxSize) : null;
    }));

    ipcMain.handle("ai-rename-chat", withChat(null, (id, title) => renameChat(id, title)));
    ipcMain.handle("ai-append-message", withChat(null, (id, message) => appendMessage(id, message)));
    ipcMain.handle("ai-finish-message", withChat(null, (id, payload) => finishAssistantMessage(id, payload ?? {})));
    ipcMain.handle("ai-update-chat-config", withChat(null, (id, config) => updateChatConfig(id, config ?? {})));
    ipcMain.handle("ai-trim-for-rerun", withChat(null, (id) => trimForRerun(id)));

    // While the AI view is open the launcher must not hide on blur, or a
    // streaming answer disappears the moment you click elsewhere.
    ipcMain.on("ai-set-mode", (_, active) => {
        appStates.aiMode = Boolean(active);
        // Approvals nobody can see are refused after a short grace, rather
        // than holding a tool call for the full timeout; coming back in time
        // keeps them.
        for (const turn of inFlight.values()) {
            for (const pending of turn.permissions.values()) {
                clearTimeout(pending.awayTimer);
                pending.awayTimer = active ? null : setTimeout(() => pending.settle("deny"), PERMISSION_AWAY_MS);
            }
        }
    });

    // The AI view's pin: whether clicking away leaves the window up.
    ipcMain.on("ai-set-keep-open", (_, keepOpen) => {
        appStates.aiKeepOpen = keepOpen !== false;
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
    // abandoning them is right, there is nothing left to write into.
    app.on("before-quit", () => {
        for (const turn of inFlight.values()) turn.controller.abort();
        inFlight.clear();
        // Aborting is asynchronous and the app won't wait for it; the CLIs
        // and whatever they started are ended here, synchronously.
        killAllTrees();
    });
}
