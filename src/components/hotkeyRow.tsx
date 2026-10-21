import { ReactNode, useEffect, useRef, useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { comboFromEvent, comboParts } from "@/data/keybindings.ts";
import { Spinner } from "@/components/ui/spinner.tsx";

export function Keycap({ children }: { children: string }) {
    return (
        <span className="inline-flex items-center justify-center min-w-5.5 h-5 px-1.5 rounded-md bg-fill-060 border border-line-080 text-10 font-mono text-tone-600">
            {children}
        </span>
    );
}

export function Combo({ combo }: { combo: string }) {
    const parts = comboParts(combo);
    if (parts.length === 0) return <span className="text-11 text-tone-250">Not set</span>;
    return (
        <span className="flex items-center gap-1">
            {parts.map((p, i) => (
                <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-tone-200 text-10">+</span>}
                    <Keycap>{p}</Keycap>
                </span>
            ))}
        </span>
    );
}

/**
 * What a save or reset came to: null when it took, otherwise why not. `revert`
 * means the old binding is still the live one, so the recorder closes to show
 * it rather than leaving a draft up that never took effect.
 */
export type SaveResult = { message: string; revert?: boolean } | null;

/** A small icon button beside the keycaps — Reset on Shortcuts, Clear on Apps and Links. */
export type RowAction = { icon: ReactNode; title: string; run: () => Promise<SaveResult> };

/**
 * One shortcut row. Swaps the keycaps for a live recorder while capturing, so
 * the thing you are about to bind is shown in the place it will end up.
 */
export function HotkeyRow({ anchor, icon, title, description, note, current, editable = true, recording, onRecord, onStop, onSave, action }: {
    anchor?: string;
    icon?: ReactNode;
    title: string;
    description?: ReactNode;
    /** A standing warning about the live binding, as opposed to a failed edit. */
    note?: string | null;
    current: string;
    editable?: boolean;
    /** Owned by the section, so two rows can't listen for keys at once. */
    recording: boolean;
    onRecord: () => void;
    onStop: () => void;
    onSave: (combo: string) => Promise<SaveResult>;
    action?: RowAction | null;
}) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const draftRef = useRef("");

    useEffect(() => {
        if (!recording) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") { onStop(); setDraft(""); draftRef.current = ""; return; }
            const combo = comboFromEvent(e);
            // Modifiers alone aren't a binding; keep listening until a real key
            // lands so holding Ctrl doesn't read as a finished combo.
            if (!combo || /^(Ctrl|Alt|Shift|Super)(\+(Ctrl|Alt|Shift|Super))*$/.test(combo)) return;
            setDraft(combo);
            draftRef.current = combo;
            setError(null);
        };
        // Capture phase: the app's own shortcuts are on window too, and a
        // recorder that fires them while you record is useless.
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [recording, onStop]);

    const commit = async () => {
        const combo = draftRef.current;
        if (!combo || busy) return;
        setBusy(true);
        let result: SaveResult;
        try {
            result = await onSave(combo);
        } catch {
            result = { message: "Couldn't save that shortcut.", revert: true };
        } finally {
            setBusy(false);
        }
        if (result) {
            setError(result.message);
            if (!result.revert) return;
        }
        onStop();
        setDraft("");
        draftRef.current = "";
    };

    const runAction = async () => {
        if (busy || !action) return;
        setError(null);
        setBusy(true);
        try {
            const result = await action.run();
            if (result) setError(result.message);
        } catch {
            setError("Couldn't change that shortcut.");
        } finally {
            setBusy(false);
        }
    };

    const cancel = () => { onStop(); setDraft(""); draftRef.current = ""; setError(null); };

    const warning = error ?? note;

    return (
        <div
            data-setting={anchor}
            className="group flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-fill-025 border border-line-050 hover:border-line-090 transition-colors"
        >
            <div className="flex items-center gap-3 min-w-0">
                {icon}
                <div className="min-w-0">
                    <h3 className="text-12.5 font-medium text-tone-850 tracking-tight truncate">{title}</h3>
                    {description && <p className="text-11 text-tone-400 leading-relaxed mt-0.5 truncate">{description}</p>}
                    {warning && (
                        <p className="flex items-center gap-1.5 text-10.5 text-amber-300/80 mt-1">
                            <AlertTriangle size={10} className="shrink-0" /> {warning}
                        </p>
                    )}
                </div>
            </div>

            <div className="shrink-0 flex items-center gap-1.5">
                {recording ? (
                    <>
                        <div className="flex items-center h-7 px-2 rounded-lg bg-fill-040 border border-line-090 min-w-28 justify-center">
                            {draft
                                ? <Combo combo={draft} />
                                : <span className="text-11 text-tone-400 animate-pulse">Press keys…</span>}
                        </div>
                        <button onClick={cancel} aria-label="Cancel"
                            className="flex items-center justify-center w-6 h-6 rounded-md text-tone-400 hover:text-tone-800 hover:bg-fill-060 transition-colors cursor-pointer">
                            <X size={12} />
                        </button>
                        <button onClick={commit} disabled={!draft} aria-label="Save"
                            className="flex items-center justify-center w-6 h-6 rounded-md bg-ink text-surface disabled:opacity-30 hover:opacity-90 transition-opacity cursor-pointer">
                            {busy ? <Spinner /> : <Check size={12} />}
                        </button>
                    </>
                ) : (
                    <>
                        <Combo combo={current} />
                        {editable && (
                            <>
                                <button
                                    onClick={() => { onRecord(); setError(null); }}
                                    className="ml-1.5 h-7 px-2.5 rounded-lg text-11 text-tone-500 hover:text-tone-800 hover:bg-fill-060 transition-colors cursor-pointer"
                                >
                                    {current ? "Change" : "Set"}
                                </button>
                                {action && (
                                    <button onClick={runAction} disabled={busy} title={action.title} aria-label={action.title}
                                        className="flex items-center justify-center w-6 h-6 rounded-md text-tone-300 hover:text-tone-700 hover:bg-fill-060 transition-colors cursor-pointer">
                                        {busy ? <Spinner /> : action.icon}
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
