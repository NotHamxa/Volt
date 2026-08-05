import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Owns one conversation: streaming, persistence, and cancellation.
 *
 * The streamed answer is held in local state while it arrives and only written
 * to disk when the turn completes — a partial answer isn't worth a file write
 * per token, and a cancelled turn still commits whatever arrived.
 */
export function useChat() {
    const [chat, setChat] = useState<AiChat | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [partial, setPartial] = useState("");
    const [error, setError] = useState<string | null>(null);

    const requestIdRef = useRef<string | null>(null);
    const partialRef = useRef("");
    const chatRef = useRef<AiChat | null>(null);
    useEffect(() => { chatRef.current = chat; }, [chat]);

    // A single subscription for the window's lifetime; chunks are matched to the
    // active request so a cancelled turn's late chunks are ignored.
    useEffect(() => {
        const detach = window.ai.onChunk(async (chunk) => {
            if (chunk.requestId !== requestIdRef.current) return;

            if (chunk.type === "text") {
                partialRef.current += chunk.text;
                setPartial(partialRef.current);
                return;
            }
            if (chunk.type === "error") {
                setError(chunk.message);
                return;
            }
            if (chunk.type === "done") {
                const current = chatRef.current;
                requestIdRef.current = null;
                setStreaming(false);
                setPartial("");
                partialRef.current = "";
                // The main process already committed the answer before sending
                // this, so re-read rather than writing it a second time.
                if (current) {
                    const updated = await window.ai.getChat(current.id);
                    if (updated) setChat(updated);
                }
            }
        });
        return detach;
    }, []);

    /**
     * Returns the loaded chat so the caller can restore its provider setup.
     *
     * A turn may still be running for this conversation in the main process —
     * you can leave the view mid-answer and come back — so reopening reattaches
     * to it and picks the stream up from whatever has arrived so far.
     */
    const openChat = useCallback(async (id: string) => {
        const loaded = await window.ai.getChat(id);
        if (!loaded) return null;
        setError(null);

        const active = await window.ai.activeTurn(id);
        if (active) {
            // Disk holds the question but no answer yet; give the stream a turn
            // to render into.
            if (loaded.messages[loaded.messages.length - 1]?.role !== "assistant") {
                loaded.messages.push({ role: "assistant", content: "" });
            }
            requestIdRef.current = active.requestId;
            partialRef.current = active.text;
            setPartial(active.text);
            setStreaming(true);
        } else {
            requestIdRef.current = null;
            partialRef.current = "";
            setPartial("");
            setStreaming(false);
        }

        setChat({ ...loaded });
        return loaded;
    }, []);

    const newChat = useCallback(() => {
        setChat(null);
        setError(null);
        setPartial("");
        partialRef.current = "";
    }, []);

    type SendOpts = { providerId: string; model?: string; settings?: Record<string, string> };

    /** Fires the request for a chat whose transcript is already in the right shape. */
    const startTurn = useCallback(async (active: AiChat, text: string, opts: SendOpts) => {
        const requestId = crypto.randomUUID();
        requestIdRef.current = requestId;
        partialRef.current = "";
        setPartial("");
        setStreaming(true);

        const result = await window.ai.send({
            requestId,
            providerId: opts.providerId,
            prompt: text,
            sessionId: active.sessionId,
            // Stateless providers need the transcript; main reads it by id
            // rather than having it re-sent over IPC each turn.
            chatId: active.id,
            model: opts.model,
            settings: opts.settings,
        });

        if (!result?.ok) {
            setError(result?.detail ?? "Could not start the request");
            setStreaming(false);
            requestIdRef.current = null;
        }
    }, []);

    const send = useCallback(async (prompt: string, opts: SendOpts) => {
        const text = prompt.trim();
        if (!text || streaming) return;

        setError(null);

        // Start a chat lazily so an empty window doesn't litter the history.
        let active = chatRef.current;
        if (!active) {
            active = await window.ai.createChat({
                providerId: opts.providerId,
                model: opts.model ?? null,
                // Stamped at creation so reopening the chat restores this setup.
                settings: opts.settings,
            });
        }

        const withUser = await window.ai.appendMessage(active.id, { role: "user", content: text });
        if (withUser) {
            // An empty assistant turn gives the transcript something to stream into.
            withUser.messages.push({ role: "assistant", content: "" });
            setChat({ ...withUser });
            active = withUser;
        }

        await startTurn(active, text, opts);
    }, [streaming, startTurn]);

    /**
     * Asks the last question again, discarding the answer it produced. The user
     * turn is left in place, so this replaces the reply rather than duplicating
     * the prompt.
     */
    const rerun = useCallback(async (opts: SendOpts) => {
        const current = chatRef.current;
        if (!current || streaming) return;

        const lastUser = [...current.messages].reverse().find(m => m.role === "user");
        if (!lastUser?.content.trim()) return;

        setError(null);
        const trimmed = await window.ai.trimForRerun(current.id);
        if (!trimmed) return;

        trimmed.messages.push({ role: "assistant", content: "" });
        setChat({ ...trimmed });

        await startTurn(trimmed, lastUser.content, opts);
    }, [streaming, startTurn]);

    const cancel = useCallback(async () => {
        const id = requestIdRef.current;
        if (id) await window.ai.cancel(id);
    }, []);

    return { chat, streaming, partial, error, send, rerun, cancel, openChat, newChat };
}
