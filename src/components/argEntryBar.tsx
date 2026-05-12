import { useEffect, useMemo, useRef, useState } from "react";
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

    useEscape(onCancel, true);

    const missingRequired = args.some(a => a.required && !(values[a.name] ?? "").trim());

    const runIfReady = () => {
        if (missingRequired) return;
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
            e.preventDefault();
            if (idx === args.length - 1) runIfReady();
            else focusSibling(idx, 1);
        } else if (e.key === "Tab") {
            e.preventDefault();
            focusSibling(idx, e.shiftKey ? -1 : 1);
        } else if (e.key === "Backspace" && (e.currentTarget.value === "") && idx === 0) {
            // Empty first field + backspace = back out of arg mode entirely.
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div className="flex flex-row gap-2.5 items-center px-5 border-b border-white/[0.07] mb-[5px] min-h-[44px] py-1.5">
            <Terminal size={18} className="text-white/40 shrink-0" />
            <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-white/[0.07] border border-white/[0.12] text-[11.5px] text-white/80 font-medium shrink-0">
                <span className="truncate max-w-[140px]">{command.name}</span>
                <button
                    onClick={onCancel}
                    className="p-0.5 rounded text-white/35 hover:text-white/85 hover:bg-white/[0.08] transition-colors"
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
                            <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isMissing ? "text-red-400/75" : "text-white/35"}`}>
                                {arg.label || arg.name}
                                {arg.required && <span className="ml-0.5 text-red-400/70">*</span>}
                            </span>
                            <input
                                ref={el => { inputRefs.current[i] = el; }}
                                value={value}
                                onChange={e => setValues(v => ({ ...v, [arg.name]: e.target.value }))}
                                onKeyDown={e => handleKey(e, i)}
                                placeholder={arg.defaultValue || "—"}
                                className={`bg-transparent border-b outline-none text-[13px] text-white/85 placeholder:text-white/20 transition-colors min-w-[80px] max-w-[180px] py-1 ${
                                    isMissing ? "border-red-500/40 focus:border-red-500/70" : "border-white/[0.1] focus:border-white/[0.4]"
                                }`}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-white/30">
                    {missingRequired ? "Fill required" : "Run"}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-white/[0.05] border border-white/[0.08] text-white/40 font-mono">↵</span>
            </div>
        </div>
    );
}
