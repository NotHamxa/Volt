import { useLayoutEffect, type ReactNode } from "react";
import { useSmoothText } from "@/ai/useSmoothText.ts";

/**
 * The answer being streamed, revealed at a steady pace.
 *
 * Providers deliver in slabs, not tokens, so the text is drained across the
 * frames between them. That means a render per frame, and this component is
 * where it stays: only the live answer redraws at that rate, while the view
 * around it re-renders when a chunk actually arrives.
 *
 * `settled` shows everything at once. Stopping sets it too: once you've asked
 * for a stop, text must not carry on appearing from the buffer while the
 * provider winds down.
 */
export function LiveReveal({ text, settled, onReveal, children }: {
    text: string;
    settled: boolean;
    /** Called after each frame of the reveal is laid out, to keep it in view. */
    onReveal: () => void;
    children: (shown: string) => ReactNode;
}) {
    const shown = useSmoothText(text, settled);
    useLayoutEffect(() => { onReveal(); }, [shown, onReveal]);
    return <>{children(shown)}</>;
}
