import { useEffect } from "react";
type Entry = { handler: () => void; id: symbol; passthrough: boolean };
const stack: Entry[] = [];

// Baseline OS-level Esc state set by the app shell — restored when the stack
// drains. While any overlay (modal, context menu) is open we force pause=true
// so the Electron globalShortcut("Esc") can't reach the main process and hide
// the window / clear the query before the in-renderer handlers run.
let baselineEscPaused = false;
function setOsEscape(paused: boolean) {
    try {
        (window as any).electron?.toggleEscape?.(paused);
    } catch { /* preload not ready */ }
}

export function setEscapeBaseline(paused: boolean) {
    baselineEscPaused = paused;
    if (stack.length === 0) setOsEscape(paused);
}

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
            if (top.passthrough) return; // let the overlay's own handler run
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
    const wasEmpty = stack.length === 0;
    stack.push(entry);
    if (wasEmpty) setOsEscape(true);
    return () => {
        const i = stack.indexOf(entry);
        if (i !== -1) stack.splice(i, 1);
        if (stack.length === 0) setOsEscape(baselineEscPaused);
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

export function isEscapeCaptured(): boolean {
    return stack.length > 0;
}
