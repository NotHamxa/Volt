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
    // Between asking a turn to stop and it actually ending. The provider
    // takes a moment to notice, and without this the view carried on as if
    // nothing had happened.
    const [stopping, setStopping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requestIdRef = useRef<string | null>(null);
    const partialRef = useRef("");
    const chatRef = useRef<AiChat | null>(null);
    useEffect(() => { chatRef.current = chat; }, [chat]);

    // Tokens arrive faster than the screen refreshes, so they're accumulated and
    // handed to React once per frame. Rendering per token meant a full markdown
    // re-parse per token — the work that made streaming feel like it was
    // struggling, and it got worse the longer the answer ran.
    const bufferRef = useRef("");
    const frameRef = useRef<number | null>(null);

    const flush = useCallback(() => {
        frameRef.current = null;
        if (!bufferRef.current) return;
        partialRef.current += bufferRef.current;
        bufferRef.current = "";
        setPartial(partialRef.current);
    }, []);

    // Nothing should be left scheduled against an unmounted view.
    useEffect(() => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    }, []);

    // A single subscription for the window's lifetime; chunks are matched to the
    // active request so a cancelled turn's late chunks are ignored.
    useEffect(() => {
        const detach = window.ai.onChunk(async (chunk) => {
            if (chunk.requestId !== requestIdRef.current) return;

            if (chunk.type === "text") {
                bufferRef.current += chunk.text;
                if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
                return;
            }
            if (chunk.type === "error") {
                setError(chunk.message);
                return;
            }
            if (chunk.type === "done") {
                const current = chatRef.current;
                requestIdRef.current = null;

                // Read the committed transcript *before* clearing the live
                // buffer. Clearing first rendered the answer as an empty
                // placeholder for a frame — the transcript collapsed, the
                // viewport clamped, and the restored content never scrolled
                // back because none of the effect's dependencies had changed.
                let updated: AiChat | null = null;
                if (current) {
                    try {
                        updated = await window.ai.getChat(current.id);
                    } catch { /* keep what's on screen */ }
                }

                // Batched into one render, so the message never blanks.
                if (updated) setChat(updated);
                setStreaming(false);
                setStopping(false);
                setPartial("");
                partialRef.current = "";
            }
        });
        return detach;
    }, [flush]);

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
            setStopping(false);
        } else {
            requestIdRef.current = null;
            partialRef.current = "";
            setPartial("");
            setStreaming(false);
            setStopping(false);
        }

        setChat({ ...loaded });
        return loaded;
    }, []);

    /**
     * Starts a blank conversation, detaching from any turn being watched.
     *
     * The turn itself keeps running — the main process owns it and still writes
     * its answer to its own chat — so this only stops *viewing* it. Leaving the
     * streaming flag set meant a running answer blocked every new conversation,
     * because send() refuses to start one while it thinks a turn is in flight.
     */
    const newChat = useCallback(() => {
        setChat(null);
        setError(null);
        setPartial("");
        partialRef.current = "";
        bufferRef.current = "";
        requestIdRef.current = null;
        setStreaming(false);
        setStopping(false);
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

    /**
     * Asks the turn to stop. Providers take a moment to wind down, so the view
     * is told immediately rather than waiting: the answer freezes where it is
     * and the button changes. Whatever arrived is still committed by the main
     * process, and the real `done` clears the flag.
     */
    const cancel = useCallback(async () => {
        const id = requestIdRef.current;
        if (!id || stopping) return;
        setStopping(true);
        await window.ai.cancel(id);
    }, [stopping]);

    return { chat, streaming, stopping, partial, error, send, rerun, cancel, openChat, newChat };
}
