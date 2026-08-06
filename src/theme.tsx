import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/**
 * `electron-store` holds the preference — it is where every other setting
 * lives, and the main process needs to read it to style the notification
 * toast, which is its own window.
 *
 * localStorage mirrors it purely so the choice can be read *synchronously*.
 * Reading the store is an IPC round-trip, and the launcher is a window you
 * summon dozens of times a day; without the mirror every open would paint
 * dark first and correct itself a frame later. The inline script in
 * index.html reads the mirror before React exists.
 */
const STORE_KEY = "theme";
const MIRROR_KEY = "volt-theme";
const DEFAULT_CHOICE: ThemeChoice = "dark";

const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

function systemTheme(): ResolvedTheme {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(choice: ThemeChoice): ResolvedTheme {
    return choice === "system" ? systemTheme() : choice;
}

/** Whatever the pre-paint script settled on, so React starts in agreement. */
function mirroredChoice(): ThemeChoice {
    try {
        const raw = localStorage.getItem(MIRROR_KEY);
        return isChoice(raw) ? raw : DEFAULT_CHOICE;
    } catch {
        return DEFAULT_CHOICE;
    }
}

function apply(theme: ResolvedTheme) {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    // Gets native form controls, scrollbars and caret colours to match.
    root.style.colorScheme = theme;
}

type ThemeContextValue = {
    choice: ThemeChoice;
    resolved: ResolvedTheme;
    setChoice: (next: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [choice, setChoiceState] = useState<ThemeChoice>(mirroredChoice);
    const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(mirroredChoice()));

    // The store is authoritative. The mirror can be stale — a factory reset
    // clears the store but not localStorage — so reconcile once on mount and
    // heal the mirror from whatever the store says.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const stored = await window.electronStore.get(STORE_KEY);
            if (cancelled) return;
            const next = isChoice(stored) ? stored : DEFAULT_CHOICE;
            try { localStorage.setItem(MIRROR_KEY, next); } catch { /* best effort */ }
            setChoiceState(next);
        })();
        return () => { cancelled = true; };
    }, []);

    // Applied on every change, including the first: the reconcile above may
    // disagree with what the pre-paint script guessed.
    useEffect(() => {
        const next = resolve(choice);
        apply(next);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResolved(next);
    }, [choice]);

    // Only while following the OS — otherwise an explicit choice would be
    // overridden the next time the system flipped.
    useEffect(() => {
        if (choice !== "system") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => {
            const next = systemTheme();
            apply(next);
            setResolved(next);
        };
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [choice]);

    // Persisting lives here rather than in an effect so the initial render
    // can't race the reconcile and write the mirror back over the store.
    const setChoice = useCallback((next: ThemeChoice) => {
        setChoiceState(next);
        try { localStorage.setItem(MIRROR_KEY, next); } catch { /* best effort */ }
        window.electronStore.set(STORE_KEY, next);
    }, []);

    const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used inside a ThemeProvider");
    return ctx;
}
