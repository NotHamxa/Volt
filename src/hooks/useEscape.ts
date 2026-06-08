import { useEffect } from "react";
type Entry = { handler: () => void; id: symbol; passthrough: boolean };
const stack: Entry[] = [];

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

export function isEscapeCaptured(): boolean {
    return stack.length > 0;
}
