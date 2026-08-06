import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X, AlertTriangle } from "lucide-react";
import { SectionLead, GroupLabel } from "@/components/settingsLayout.tsx";
import { BINDINGS, Binding, BindingGroup, comboFromEvent, comboParts } from "@/data/keybindings.ts";
import { useKeybindings, conflictWith } from "@/hooks/useKeybindings.ts";
import { Spinner } from "@/components/ui/spinner.tsx";

const GROUP_ORDER: BindingGroup[] = ["Global", "Navigation", "Results", "AI", "Settings"];

const GROUP_HINT: Record<BindingGroup, string> = {
    Global: "Works anywhere in Windows, even when Volt is closed",
    Navigation: "Moving around Volt",
    Results: "Driving the result list",
    AI: "In the chat view",
    Settings: "In here",
};

function Keycap({ children }: { children: string }) {
    return (
        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-md bg-fill-060 border border-line-080 text-[10px] font-mono text-tone-600">
            {children}
        </span>
    );
}

function Combo({ combo }: { combo: string }) {
    const parts = comboParts(combo);
    if (parts.length === 0) return <span className="text-[11px] text-tone-250">Not set</span>;
    return (
        <span className="flex items-center gap-1">
            {parts.map((p, i) => (
                <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-tone-200 text-[10px]">+</span>}
                    <Keycap>{p}</Keycap>
                </span>
            ))}
        </span>
    );
}

/**
 * One row. Editable rows swap the keycaps for a live recorder while capturing,
 * so the thing you are about to bind is shown in the place it will end up.
 */
function BindingRow({ binding, current, recording, onRecord, onStop, onSave, onReset }: {
    binding: Binding;
    current: string;
    /** Owned by the section, so two rows can't listen for keys at once. */
    recording: boolean;
    onRecord: () => void;
    onStop: () => void;
    onSave: (combo: string) => Promise<string | null> | string | null;
    onReset: () => void;
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
        if (!combo) return;
        setBusy(true);
        const err = await onSave(combo);
        setBusy(false);
        if (err) { setError(err); return; }
        onStop();
        setDraft("");
        draftRef.current = "";
    };

    const cancel = () => { onStop(); setDraft(""); draftRef.current = ""; setError(null); };

    return (
        <div
            data-setting={binding.id}
            className="group flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-fill-025 border border-line-050 hover:border-line-090 transition-colors"
        >
            <div className="min-w-0">
                <h3 className="text-[12.5px] font-medium text-tone-850 tracking-tight">{binding.label}</h3>
                <p className="text-[11px] text-tone-400 leading-relaxed mt-0.5">{binding.description}</p>
                {error && (
                    <p className="flex items-center gap-1.5 text-[10.5px] text-amber-300/80 mt-1">
                        <AlertTriangle size={10} /> {error}
                    </p>
                )}
            </div>

            <div className="shrink-0 flex items-center gap-1.5">
                {recording ? (
                    <>
                        <div className="flex items-center h-7 px-2 rounded-lg bg-fill-040 border border-line-090 min-w-28 justify-center">
                            {draft
                                ? <Combo combo={draft} />
                                : <span className="text-[11px] text-tone-400 animate-pulse">Press keys…</span>}
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
                        {binding.editable && (
                            <>
                                <button
                                    onClick={() => { onRecord(); setError(null); }}
                                    className="ml-1.5 h-7 px-2.5 rounded-lg text-[11px] text-tone-500 hover:text-tone-800 hover:bg-fill-060 transition-colors cursor-pointer"
                                >
                                    Change
                                </button>
                                {current !== binding.default && (
                                    <button onClick={onReset} title="Reset to default"
                                        className="flex items-center justify-center w-6 h-6 rounded-md text-tone-300 hover:text-tone-700 hover:bg-fill-060 transition-colors cursor-pointer">
                                        <RotateCcw size={11} />
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

export default function KeysSection({ onRecordingChange }: { onRecordingChange?: (v: boolean) => void }) {
    const { get, set, reset } = useKeybindings();
    const [globalCombo, setGlobalCombo] = useState("");
    const [recordingId, setRecordingId] = useState<string | null>(null);

    useEffect(() => {
        window.electronStore.get("openWindowBind").then(v => setGlobalCombo(v || ""));
    }, []);

    // A half-recorded shortcut is the one unsaved edit in settings, so the
    // shell's discard-changes guard follows it here.
    useEffect(() => {
        onRecordingChange?.(recordingId !== null);
    }, [recordingId, onRecordingChange]);

    /** Returns an error string, or null when the binding was taken. */
    const save = async (b: Binding, combo: string): Promise<string | null> => {
        if (b.global) {
            // Registered with the OS, which refuses single keys and anything
            // another application already owns.
            if (comboParts(combo).length < 2) return "Use at least two keys, e.g. Ctrl + Space.";
            const ok = await window.electron.setOpenBind(combo.split("+").join("+"));
            if (!ok) return "Windows wouldn't grant that combination — something else has it.";
            setGlobalCombo(combo);
            return null;
        }
        const clash = conflictWith(b.id, combo);
        if (clash) return `Already used by "${clash}".`;
        set(b.id, combo);
        return null;
    };

    return (
        <div className="space-y-7">
            <SectionLead>
                Every shortcut Volt responds to. The ones without a Change button are
                structural — remapping Enter or Escape would leave no way to accept or
                back out of anything.
            </SectionLead>

            {GROUP_ORDER.map(group => {
                const members = BINDINGS.filter(b => b.group === group);
                if (members.length === 0) return null;
                return (
                    <div key={group} className="space-y-2">
                        <div className="flex items-baseline gap-2">
                            <GroupLabel>{group}</GroupLabel>
                            <span className="text-[10px] text-tone-250">{GROUP_HINT[group]}</span>
                        </div>
                        {members.map(b => (
                            <BindingRow
                                key={b.id}
                                binding={b}
                                current={b.global ? globalCombo : get(b.id)}
                                recording={recordingId === b.id}
                                onRecord={() => setRecordingId(b.id)}
                                onStop={() => setRecordingId(null)}
                                onSave={combo => save(b, combo)}
                                onReset={() => reset(b.id)}
                            />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
