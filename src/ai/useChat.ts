import { useCallback, useEffect, useRef, useState } from "react";

/** Chats saved before steps had a status stored flat labels; read those too. */
export function stepsOf(message: Pick<AiMessage, "steps" | "activities">): AiStep[] {
    if (message.steps?.length) return message.steps;
    return (message.activities ?? []).map((a, i) => ({ id: `legacy-${i}`, label: a.label, detail: a.detail, status: "done" }));
}

/** Chats saved before thinking was split up kept it as one string, drawn first. */
export function thoughtsOf(message: Pick<AiMessage, "thoughts" | "reasoning">): AiThought[] {
    if (message.thoughts?.length) return message.thoughts;
    return message.reasoning?.trim() ? [{ id: "legacy-reasoning", text: message.reasoning, at: 0, seq: -1 }] : [];
}

/**
 * Owns one conversation: streaming, persistence, and cancellation.
 *
 * The streamed answer is held in local state while it arrives and only written
 * to disk when the turn completes, a partial answer isn't worth a file write
 * per token, and a cancelled turn still commits whatever arrived.
 */
export function useChat() {
    const [chat, setChat] = useState<AiChat | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [partial, setPartial] = useState("");
    // Live values for the turn in flight. Once it finishes, the trail is saved
    // onto the message itself and read from there, so this only ever describes
    // what is happening right now.
    const [thoughts, setThoughts] = useState<AiThought[]>([]);
    const [steps, setSteps] = useState<AiStep[]>([]);
    const [plan, setPlan] = useState<AiPlanItem[] | null>(null);
    // What each subagent has written so far, by the step that started it.
    const [agentText, setAgentText] = useState<Record<string, string>>({});
    const [stats, setStats] = useState<AiTurnStats>({});
    // When the turn in flight began, for the clock beside it.
    const [startedAt, setStartedAt] = useState<number | null>(null);
    // How much text and thinking had arrived when the provider last reported
    // its output count. Whatever came after is estimated on top of it, so the
    // count climbs as the answer streams rather than only between calls.
    const [countedChars, setCountedChars] = useState(0);
    // Between asking a turn to stop and it actually ending. The provider
    // takes a moment to notice, and without this the view carried on as if
    // nothing had happened.
    const [stopping, setStopping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Tool calls the turn is waiting on the user to approve.
    const [permissions, setPermissions] = useState<AiPermissionRequest[]>([]);

    const requestIdRef = useRef<string | null>(null);
    // Bumped by every open and new chat. Stepping through conversations fires
    // opens faster than they load, and one finishing late must not replace
    // the chat that was asked for after it.
    const viewSeqRef = useRef(0);
    const partialRef = useRef("");
    const chatRef = useRef<AiChat | null>(null);
    useEffect(() => { chatRef.current = chat; }, [chat]);

    // Tokens arrive faster than the screen refreshes, so they're accumulated and
    // handed to React once per frame. Rendering per token meant a full markdown
    // re-parse per token, the work that made streaming feel like it was
    // struggling, and it got worse the longer the answer ran.
    const bufferRef = useRef("");
    // Thinking is buffered the same way: edited in place here, copied out
    // to state once per frame.
    const thoughtsRef = useRef<AiThought[]>([]);
    const thoughtsDirtyRef = useRef(false);
    const frameRef = useRef<number | null>(null);
    const outputTokensRef = useRef<number | undefined>(undefined);

    /** Answer and thinking received so far, including what awaits a frame. */
    const streamedChars = useCallback(() => (
        partialRef.current.length + bufferRef.current.length
        + thoughtsRef.current.reduce((n, t) => n + t.text.length, 0)
    ), []);

    const flush = useCallback(() => {
        frameRef.current = null;
        if (bufferRef.current) {
            partialRef.current += bufferRef.current;
            bufferRef.current = "";
            setPartial(partialRef.current);
        }
        // Shares the frame with the answer: a model that thinks and answers in
        // the same turn would otherwise schedule two renders per frame.
        if (thoughtsDirtyRef.current) {
            thoughtsDirtyRef.current = false;
            setThoughts(thoughtsRef.current.map(t => ({ ...t })));
        }
    }, []);

    // Nothing should be left scheduled against an unmounted view.
    useEffect(() => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    }, []);

    /**
     * Drops everything buffered for the stream being watched. Clearing only
     * `partialRef` left the per-frame buffers and their pending frame behind,
     * so the tail of chat A's answer could land in chat B.
     */
    const resetStream = useCallback((text = "", thinking: AiThought[] = []) => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        bufferRef.current = "";
        partialRef.current = text;
        thoughtsRef.current = thinking.map(t => ({ ...t }));
        thoughtsDirtyRef.current = false;
        setPartial(text);
        setThoughts(thoughtsRef.current);
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
            if (chunk.type === "reasoning") {
                // Buffered with the answer rather than set per token: thinking
                // arrives just as fast, and it was the per-token re-render that
                // made streaming feel like it was struggling.
                const thought = thoughtsRef.current.find(t => t.id === chunk.thoughtId);
                if (!thought) return;
                thought.text += chunk.text;
                thoughtsDirtyRef.current = true;
                if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
                return;
            }
            if (chunk.type === "thought") {
                // Where it sits and when it started or ended; never its text,
                // which only ever arrives as "reasoning".
                const meta: Partial<AiThought> = { ...chunk.thought };
                delete meta.text;
                const at = thoughtsRef.current.findIndex(t => t.id === meta.id);
                if (at === -1) thoughtsRef.current.push({ ...meta, id: chunk.thought.id, text: "" });
                else thoughtsRef.current[at] = { ...thoughtsRef.current[at], ...meta };
                thoughtsDirtyRef.current = true;
                if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
                return;
            }
            if (chunk.type === "step") {
                // Main sends the whole merged step, so replacing is enough.
                const step = chunk.step;
                setSteps(prev => {
                    const at = prev.findIndex(s => s.id === step.id);
                    if (at === -1) return [...prev, step];
                    const next = prev.slice();
                    next[at] = step;
                    return next;
                });
                return;
            }
            if (chunk.type === "plan") {
                setPlan(chunk.items);
                return;
            }
            if (chunk.type === "agent-text") {
                // A whole message at a time, so no need to batch it per frame.
                setAgentText(prev => ({ ...prev, [chunk.agentId]: (prev[chunk.agentId] ?? "") + chunk.text }));
                return;
            }
            if (chunk.type === "stats") {
                if (chunk.stats.outputTokens !== outputTokensRef.current) {
                    outputTokensRef.current = chunk.stats.outputTokens;
                    setCountedChars(streamedChars());
                }
                setStats(chunk.stats);
                return;
            }
            if (chunk.type === "error") {
                setError(chunk.message);
                return;
            }
            if (chunk.type === "permission") {
                const { permissionId, toolName, title, detail } = chunk;
                setPermissions(prev => [...prev, { permissionId, toolName, title, detail }]);
                return;
            }
            if (chunk.type === "permission-resolved") {
                setPermissions(prev => prev.filter(p => p.permissionId !== chunk.permissionId));
                return;
            }
            if (chunk.type === "done") {
                const current = chatRef.current;
                requestIdRef.current = null;

                // Read the committed transcript *before* clearing the live
                // buffer. Clearing first rendered the answer as an empty
                // placeholder for a frame, the transcript collapsed, the
                // viewport clamped, and the restored content never scrolled
                // back because none of the effect's dependencies had changed.
                let updated: AiChat | null = null;
                if (current) {
                    try {
                        updated = await window.ai.getChat(current.id);
                    } catch { /* keep what's on screen */ }
                }

                // Another chat was opened while that read was in flight; this
                // turn's result is on disk and no longer ours to show.
                if (current && chatRef.current?.id !== current.id) return;

                // Batched into one render, so the message never blanks.
                if (updated) {
                    setChat(updated);
                    // The failure is saved on the answer now and shown there.
                    if (updated.messages.at(-1)?.error) setError(null);
                }
                setStreaming(false);
                setStopping(false);
                setPermissions([]);
                resetStream();
            }
        });
        return detach;
    }, [flush, resetStream, streamedChars]);

    /**
     * Returns the loaded chat so the caller can restore its provider setup.
     *
     * A turn may still be running for this conversation in the main process,
     * you can leave the view mid-answer and come back, so reopening reattaches
     * to it and picks the stream up from whatever has arrived so far.
     */
    const openChat = useCallback(async (id: string) => {
        const seq = ++viewSeqRef.current;
        const loaded = await window.ai.getChat(id);
        if (!loaded) return null;
        const active = await window.ai.activeTurn(id);
        if (seq !== viewSeqRef.current) return null;
        setError(null);

        // Whatever the trail was for a *previous* turn belongs to a message
        // that is already on disk; only a turn still running has one to show.
        resetStream(active?.text ?? "", active?.thoughts ?? []);
        setSteps(active?.steps ?? []);
        setPlan(active?.plan ?? null);
        setAgentText(active?.agentText ?? {});
        setStats(active?.stats ?? {});
        setStartedAt(active?.startedAt ?? null);
        // What already arrived is covered by the count, if there is one yet.
        outputTokensRef.current = active?.stats.outputTokens;
        setCountedChars(active?.stats.outputTokens ? streamedChars() : 0);
        setPermissions(active?.permissions ?? []);
        if (active) {
            // Disk holds the question but no answer yet; give the stream a turn
            // to render into.
            if (loaded.messages[loaded.messages.length - 1]?.role !== "assistant") {
                loaded.messages.push({ role: "assistant", content: "" });
            }
            requestIdRef.current = active.requestId;
            setStreaming(true);
            setStopping(false);
        } else {
            requestIdRef.current = null;
            setStreaming(false);
            setStopping(false);
        }

        setChat({ ...loaded });
        return loaded;
    }, [resetStream, streamedChars]);

    /**
     * Starts a blank conversation, detaching from any turn being watched.
     *
     * The turn itself keeps running, the main process owns it and still writes
     * its answer to its own chat, so this only stops *viewing* it. Leaving the
     * streaming flag set meant a running answer blocked every new conversation,
     * because send() refuses to start one while it thinks a turn is in flight.
     */
    const newChat = useCallback(() => {
        viewSeqRef.current++;
        setChat(null);
        setError(null);
        resetStream();
        setSteps([]);
        setPlan(null);
        setAgentText({});
        setStats({});
        setStartedAt(null);
        outputTokensRef.current = undefined;
        setCountedChars(0);
        setPermissions([]);
        requestIdRef.current = null;
        setStreaming(false);
        setStopping(false);
    }, [resetStream]);

    type SendOpts = { providerId: string; model?: string; settings?: Record<string, string> };

    /** Fires the request for a chat whose transcript is already in the right shape. */
    const startTurn = useCallback(async (active: AiChat, text: string, opts: SendOpts, attachments: AiAttachment[] = []) => {
        const requestId = crypto.randomUUID();
        requestIdRef.current = requestId;
        // The previous turn's trail belongs to the answer above, which is
        // already committed; this one starts from nothing.
        resetStream();
        setSteps([]);
        setPlan(null);
        setAgentText({});
        setStats({});
        setStartedAt(Date.now());
        outputTokensRef.current = undefined;
        setCountedChars(0);
        setPermissions([]);
        setStreaming(true);

        const result = await window.ai.send({
            requestId,
            providerId: opts.providerId,
            prompt: text,
            attachments,
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
    }, [resetStream]);

    const send = useCallback(async (prompt: string, opts: SendOpts, files: AiAttachmentInput[] = []) => {
        const text = prompt.trim();
        if ((!text && !files.length) || streaming) return;

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

        // Pasted data needs the chat to exist first: it is stored under it.
        const attachments = files.length ? await window.ai.saveAttachments(active.id, files) : [];
        if (!text && !attachments.length) {
            setError("None of the attached files could be read.");
            return;
        }

        const withUser = await window.ai.appendMessage(active.id, {
            role: "user",
            content: text,
            ...(attachments.length ? { attachments } : {}),
        });
        if (withUser) {
            // An empty assistant turn gives the transcript something to stream into.
            withUser.messages.push({ role: "assistant", content: "" });
            setChat({ ...withUser });
            active = withUser;
        }

        await startTurn(active, text, opts, attachments);
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
        if (!lastUser?.content.trim() && !lastUser?.attachments?.length) return;

        setError(null);
        const trimmed = await window.ai.trimForRerun(current.id);
        if (!trimmed) return;

        trimmed.messages.push({ role: "assistant", content: "" });
        setChat({ ...trimmed });

        await startTurn(trimmed, lastUser.content, opts, lastUser.attachments ?? []);
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

    /** Answers a tool-approval prompt. Removed at once; main confirms it. */
    const respondPermission = useCallback(async (permissionId: string, decision: AiPermissionDecision) => {
        const id = requestIdRef.current;
        setPermissions(prev => prev.filter(p => p.permissionId !== permissionId));
        if (id) await window.ai.respondPermission(id, permissionId, decision);
    }, []);

    // The provider's own output count, plus roughly four characters a token
    // for whatever has streamed in since it last reported.
    const sinceCounted = partial.length + thoughts.reduce((n, t) => n + t.text.length, 0) - countedChars;
    const liveOutputTokens = (stats.outputTokens ?? 0) + Math.max(0, Math.round(sinceCounted / 4));

    return {
        chat, streaming, stopping, partial, error,
        thoughts, steps, plan, agentText, stats, startedAt, liveOutputTokens, permissions,
        send, rerun, cancel, openChat, newChat, respondPermission,
    };
}
