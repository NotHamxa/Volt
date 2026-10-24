import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal, X } from "lucide-react";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import { useEscape } from "@/hooks/useEscape.ts";

interface Props {
    command: SearchQueryT;
    initialValues?: Record<string, string>;
    onRun: (values: Record<string, string>) => void;
    onCancel: () => void;
}

// Raycast-style inline argument entry. Takes over the search-bar row when a
// command-with-args is selected: a pill for the command, then a horizontal
// strip of per-arg labeled inputs. Tab/Shift+Tab moves between fields, Enter
// runs (when all required filled), Esc cancels.
export default function ArgEntryBar({ command, initialValues, onRun, onCancel }: Props) {
    const args = useMemo(() => command.args ?? [], [command]);

    const [values, setValues] = useState<Record<string, string>>(() => {
        const seeded: Record<string, string> = {};
        for (const a of args) {
            seeded[a.name] = initialValues?.[a.name] ?? a.defaultValue ?? "";
        }
        return seeded;
    });

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Focus the first empty (or required-missing) field on mount.
    useEffect(() => {
        const firstEmpty = args.findIndex(a => !(initialValues?.[a.name] ?? a.defaultValue ?? "").trim());
        const idx = firstEmpty === -1 ? 0 : firstEmpty;
        const el = inputRefs.current[idx];
        // Defer so we win against parent autoFocus on the previous input.
        const t = setTimeout(() => el?.focus(), 0);
        return () => clearTimeout(t);
    }, [args, initialValues]);

    // Confirm-type commands ask once more before running, same as they do
    // when picked without arguments. Enter confirms, Esc steps back to editing.
    const needsConfirm = command.type === "commandConfirm" || command.type === "commandConfirmOpen";
    const [confirming, setConfirming] = useState(false);
    const confirmRef = useRef<HTMLButtonElement | null>(null);
    const lastFocusedRef = useRef(0);

    const backToEditing = useCallback(() => {
        setConfirming(false);
        setTimeout(() => inputRefs.current[lastFocusedRef.current]?.focus(), 0);
    }, []);
    const handleEscape = useCallback(() => {
        if (confirming) backToEditing();
        else onCancel();
    }, [confirming, backToEditing, onCancel]);
    useEscape(handleEscape, true);

    useEffect(() => {
        if (confirming) confirmRef.current?.focus();
    }, [confirming]);

    const missingRequired = args.some(a => a.required && !(values[a.name] ?? "").trim());

    const runIfReady = () => {
        if (missingRequired) return;
        if (needsConfirm && !confirming) {
            setConfirming(true);
            return;
        }
        onRun(values);
    };

    const handleConfirmKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== "Enter") return;
        // Same reason as the inputs: this Enter must not reach a window-level
        // listener and re-fire whatever result sits under the bar.
        e.preventDefault();
        e.stopPropagation();
        (e.nativeEvent as Event).stopImmediatePropagation?.();
        onRun(values);
    };

    const focusSibling = (currentIdx: number, dir: 1 | -1) => {
        const next = currentIdx + dir;
        if (next < 0) {
            onCancel();
            return;
        }
        const target = inputRefs.current[next];
        if (target) target.focus();
        else runIfReady();
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
        if (e.key === "Enter") {
            // Stop the native event from bubbling to any window-level listener
            // that might be re-attached during the unmount/remount of the
            // results pane (would otherwise re-fire the focused result and
            // open the Google fallback after the command runs).
            e.preventDefault();
            e.stopPropagation();
            (e.nativeEvent as Event).stopImmediatePropagation?.();
            if (idx === args.length - 1) runIfReady();
            else focusSibling(idx, 1);
        } else if (e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            focusSibling(idx, e.shiftKey ? -1 : 1);
        } else if (e.key === "Backspace" && (e.currentTarget.value === "") && idx === 0) {
            // Empty first field + backspace = back out of arg mode entirely.
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="flex flex-row gap-2.5 items-center px-5 border-b border-line-070 mb-1.25 min-h-11 py-1.5">
            <Terminal size={18} className="text-tone-400 shrink-0" />
            <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-fill-070 border border-line-120 text-11.5 text-tone-800 font-medium shrink-0">
                <span className="truncate max-w-35">{command.name}</span>
                <button
                    onClick={onCancel}
                    className="p-0.5 rounded text-tone-350 hover:text-tone-850 hover:bg-fill-080 transition-colors"
                    aria-label="Cancel argument entry"
                    tabIndex={-1}
                >
                    <X size={11} />
                </button>
            </span>
            <div className="flex-1 flex items-center gap-3 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {args.map((arg, i) => {
                    const value = values[arg.name] ?? "";
                    const isMissing = arg.required && !value.trim();
                    return (
                        <div key={arg.name} className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-10 font-semibold uppercase tracking-[0.12em] ${isMissing ? "text-red-400/75" : "text-tone-350"}`}>
                                {arg.label || arg.name}
                                {arg.required && <span className="ml-0.5 text-red-400/70">*</span>}
                            </span>
                            <input
                                ref={el => { inputRefs.current[i] = el; }}
                                value={value}
                                onChange={e => setValues(v => ({ ...v, [arg.name]: e.target.value }))}
                                onKeyDown={e => handleKey(e, i)}
                                onFocus={() => { lastFocusedRef.current = i; }}
                                readOnly={confirming}
                                placeholder={arg.defaultValue || "…"}
                                className={`bg-transparent border-b outline-none text-13 text-tone-850 placeholder:text-tone-200 transition-colors min-w-20 max-w-45 py-1 ${
                                    isMissing ? "border-red-500/40 focus:border-red-500/70" : "border-line-100 focus:border-ink/[0.4]"
                                }`}
                            />
                        </div>
                    );
                })}
            </div>
            {confirming ? (
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-11 text-amber-400/85 font-medium">Run this command?</span>
                    <button
                        onClick={backToEditing}
                        tabIndex={-1}
                        className="px-2 py-1 text-10.5 rounded-md text-tone-400 hover:text-tone-750 hover:bg-fill-050 transition-colors"
                    >
                        Cancel <span className="font-mono text-tone-250">Esc</span>
                    </button>
                    <button
                        ref={confirmRef}
                        onClick={() => onRun(values)}
                        onKeyDown={handleConfirmKey}
                        className="px-2 py-1 text-10.5 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 outline-none focus-visible:ring-1 focus-visible:ring-red-400/50 transition-colors"
                    >
                        Run <span className="font-mono">↵</span>
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-10 text-tone-300">
                        {missingRequired ? "Fill required" : "Run"}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 text-10 rounded-md bg-fill-050 border border-line-080 text-tone-400 font-mono">↵</span>
                </div>
            )}
        </div>
    );
}
