import { useEffect, useState } from "react";
import { BINDINGS } from "@/data/keybindings.ts";

const STORE_KEY = "keybindings";

/**
 * Resolved bindings, held at module scope.
 *
 * `getBinding` has to be readable from App.tsx's keydown handler, which is
 * installed once in a mount effect and would otherwise close over whatever the
 * bindings were at startup. Reading through a module lets that handler stay as
 * it is and still see an edit made seconds ago.
 */
const overrides: Record<string, string> = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

export function getBinding(id: string): string {
    if (id in overrides) return overrides[id];
    return BINDINGS.find(b => b.id === id)?.default ?? "";
}

export function allBindings(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const b of BINDINGS) out[b.id] = getBinding(b.id);
    return out;
}

/**
 * Must run at startup, not just when the settings UI mounts: the shortcuts are
 * dispatched from App.tsx, so a customised binding has to be in memory whether
 * or not anyone has opened settings this session.
 */
export async function loadKeybindings() {
    if (loaded) return;
    loaded = true;
    try {
        const raw = await window.electronStore.get(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object") {
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === "string") overrides[k] = v;
            }
            emit();
        }
    } catch { /* defaults are a fine fallback */ }
}

export function setBinding(id: string, combo: string) {
    overrides[id] = combo;
    window.electronStore.set(STORE_KEY, JSON.stringify(overrides));
    emit();
}

export function resetBinding(id: string) {
    delete overrides[id];
    window.electronStore.set(STORE_KEY, JSON.stringify(overrides));
    emit();
}

/**
 * Which other binding a combo would collide with, if any. Two commands on one
 * combo means whichever handler runs first wins, silently.
 */
export function conflictWith(id: string, combo: string): string | null {
    if (!combo) return null;
    for (const b of BINDINGS) {
        if (b.id === id || b.global) continue;
        if (getBinding(b.id) === combo) return b.label;
    }
    return null;
}

export function useKeybindings() {
    const [, force] = useState(0);
    useEffect(() => {
        const listener = () => force(n => n + 1);
        listeners.add(listener);
        loadKeybindings();
        return () => { listeners.delete(listener); };
    }, []);
    return { get: getBinding, all: allBindings(), set: setBinding, reset: resetBinding };
}
