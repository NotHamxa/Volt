import { useEffect, useRef, useState } from "react";

/** Shortest gap between reveal steps, a little under 33ms so a 60Hz frame isn't missed. */
const STEP_MS = 30;

/**
 * Reveals streamed text at a steady rate instead of in the lumps it arrives in.
 *
 * Providers don't stream a token at a time. Measured against the Claude CLI, a
 * 1151-character answer arrived as 12 deltas, a median of 111 characters every
 * ~360ms, so the text landed in visible slabs however fast the UI rendered.
 * This drains whatever has arrived across the frames until the next delta.
 *
 * The rate is derived from the backlog rather than fixed: catching up quickly
 * when far behind and easing off as it closes means a burst reads as typing,
 * and a slow provider never leaves the reveal stalled waiting on a timer.
 *
 * It advances about 30 times a second, not every frame. Each step re-renders
 * the answer, re-parses its last block and lays the transcript out again;
 * measured while streaming, 60 steps a second kept the renderer at 53-74% CPU
 * and 30 brought it to 23%, with text that still reads as typing.
 */
export function useSmoothText(target: string, settled: boolean): string {
    const [shown, setShown] = useState(0);
    const shownRef = useRef(0);
    const frameRef = useRef<number | null>(null);
    const lastRef = useRef(0);

    useEffect(() => {
        // A finished turn is shown in full; the caller swaps to the committed
        // message anyway, so there is nothing left to pace.
        if (settled) return;

        // A new turn restarts the reveal rather than resuming mid-answer.
        if (shownRef.current > target.length) {
            shownRef.current = 0;
            setShown(0);
        }

        const step = (time: number) => {
            const remaining = target.length - shownRef.current;
            if (remaining <= 0) {
                frameRef.current = null;
                return;
            }
            if (time - lastRef.current < STEP_MS) {
                frameRef.current = requestAnimationFrame(step);
                return;
            }
            lastRef.current = time;
            // A gentle ease. A quarter of the backlog per step drains about as
            // fast as an eighth did at 60 steps a second, so a 111-character
            // burst still lands close to the interval before the next one.
            shownRef.current += Math.max(1, Math.ceil(remaining / 4));
            setShown(shownRef.current);
            frameRef.current = requestAnimationFrame(step);
        };

        if (frameRef.current === null) frameRef.current = requestAnimationFrame(step);

        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [target, settled]);

    return settled ? target : target.slice(0, shown);
}
