import { useCallback, useEffect, useRef } from "react";

const STORE_KEY = "aiDrafts";
/** The unsaved conversation's slot, it has no id until its first message. */
export const NEW_DRAFT = "new";
/** Typing writes to memory at once and to disk once it pauses. */
const SAVE_DELAY_MS = 400;

/**
 * What's typed in each conversation's prompt box, by chat id.
 *
 * One shared box meant text typed in one chat followed you into the next.
 * Each conversation keeps its own now, and they're stored so a half-written
 * prompt survives Volt being closed.
 */
export function useDrafts() {
    const drafts = useRef<Record<string, string>>({});
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const persist = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        window.electronStore.set(STORE_KEY, drafts.current);
    }, []);

    const schedule = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(persist, SAVE_DELAY_MS);
    }, [persist]);

    // Leaving the view mid-word still keeps the word.
    useEffect(() => () => { if (timer.current) persist(); }, [persist]);

    /** Resolves once the stored drafts are in, so the first one can be shown. */
    const load = useCallback(async () => {
        try {
            const stored: unknown = await window.electronStore.get(STORE_KEY);
            if (stored && typeof stored === "object") {
                // Anything typed before the read came back wins.
                drafts.current = { ...(stored as Record<string, string>), ...drafts.current };
            }
        } catch { /* nothing saved yet */ }
    }, []);

    const get = useCallback((key: string) => drafts.current[key] ?? "", []);

    const set = useCallback((key: string, text: string) => {
        if ((drafts.current[key] ?? "") === text) return;
        // Empty drafts aren't kept, so the store only holds real ones.
        if (text) drafts.current[key] = text;
        else delete drafts.current[key];
        schedule();
    }, [schedule]);

    /** Hands one slot's text to another, the new chat getting its id. */
    const move = useCallback((from: string, to: string) => {
        const text = drafts.current[from];
        if (!text) return;
        delete drafts.current[from];
        drafts.current[to] = text;
        schedule();
    }, [schedule]);

    const clear = useCallback((keep?: string) => {
        drafts.current = keep && drafts.current[keep] ? { [keep]: drafts.current[keep] } : {};
        persist();
    }, [persist]);

    return { load, get, set, move, clear };
}
