import { useEffect } from "react";
type Entry = { handler: () => void; id: symbol; passthrough: boolean };
const stack: Entry[] = [];
/**
 * Escapes a barrier let through. The overlay's own handler (Radix listens on
 * document, in capture) closes it and React can commit — dropping the barrier
 * — before App's bubble-phase handler asks, so the stack alone would already
 * be empty by then and the same keypress would leave the page too.
 */
const barred = new WeakSet<Event>();

let installed = false;
function install() {
    if (installed || typeof window === "undefined") return;
    installed = true;
    window.addEventListener(
        "keydown",
        (e) => {
            if (e.key !== "Escape") return;
            if (stack.length === 0) return;
            const top = stack[stack.length - 1];
            if (top.passthrough) { barred.add(e); return; } // let the overlay's own handler run
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            top.handler();
        },
        { capture: true }
    );
}

function push(entry: Entry) {
    install();
    stack.push(entry);
    return () => {
        const i = stack.indexOf(entry);
        if (i !== -1) stack.splice(i, 1);
    };
}

export function useEscape(handler: () => void, isOpen: boolean) {
    useEffect(() => {
        if (!isOpen) return;
        return push({ handler, id: Symbol("esc"), passthrough: false });
    }, [isOpen, handler]);
}

export function useEscapeBarrier(isOpen: boolean) {
    useEffect(() => {
        if (!isOpen) return;
        return push({ handler: () => {}, id: Symbol("esc-barrier"), passthrough: true });
    }, [isOpen]);
}

/** Pass the event when asking from a keydown handler, so a barrier that closed on it still counts. */
export function isEscapeCaptured(e?: Event): boolean {
    return stack.length > 0 || (!!e && barred.has(e));
}
