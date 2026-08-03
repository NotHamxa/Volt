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
                const content = partialRef.current;
                requestIdRef.current = null;
                setStreaming(false);
                setPartial("");
                partialRef.current = "";
                if (current) {
                    const updated = await window.ai.finishMessage(current.id, {
                        content,
                        sessionId: chunk.sessionId,
                    });
                    if (updated) setChat(updated);
                }
            }
        });
        return detach;
    }, []);

    const openChat = useCallback(async (id: string) => {
        const loaded = await window.ai.getChat(id);
        if (loaded) {
            setChat(loaded);
            setError(null);
            setPartial("");
            partialRef.current = "";
        }
    }, []);

    const newChat = useCallback(() => {
        setChat(null);
        setError(null);
        setPartial("");
        partialRef.current = "";
    }, []);

    const send = useCallback(async (
        prompt: string,
        opts: { providerId: string; model?: string; settings?: Record<string, string> },
    ) => {
        const text = prompt.trim();
        if (!text || streaming) return;

        setError(null);

        // Start a chat lazily so an empty window doesn't litter the history.
        let active = chatRef.current;
        if (!active) {
            active = await window.ai.createChat({ providerId: opts.providerId, model: opts.model ?? null });
        }

        const withUser = await window.ai.appendMessage(active.id, { role: "user", content: text });
        if (withUser) {
            // An empty assistant turn gives the transcript something to stream into.
            withUser.messages.push({ role: "assistant", content: "" });
            setChat({ ...withUser });
        }

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
            model: opts.model,
            settings: opts.settings,
        });

        if (!result?.ok) {
            setError(result?.detail ?? "Could not start the request");
            setStreaming(false);
            requestIdRef.current = null;
        }
    }, [streaming]);

    const cancel = useCallback(async () => {
        const id = requestIdRef.current;
        if (id) await window.ai.cancel(id);
    }, []);

    return { chat, streaming, partial, error, send, cancel, openChat, newChat };
}
