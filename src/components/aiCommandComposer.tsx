import { useCallback, useEffect, useState } from "react";
import { Sparkles, CornerDownLeft, TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";

/**
 * Describe a command in words; the configured AI provider drafts one.
 *
 * The draft is loaded into the normal editor rather than saved, so the script
 * is read and accepted by a person before it can ever be run. There is
 * deliberately no path from here to execution.
 */
export default function AiCommandComposer({ existing, onDraft, placeholder }: {
    existing?: SearchQueryT | null;
    onDraft: (command: SearchQueryT, notes: string[]) => void;
    placeholder?: string;
}) {
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [provider, setProvider] = useState<AiProviderInfo | null>(null);
    const [model, setModel] = useState<string | undefined>();
    const [settings, setSettings] = useState<Record<string, string>>({});

    // Uses whatever Settings → AI is configured with, rather than adding a
    // second place to choose a provider.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [list, prefs] = await Promise.all([
                window.ai.listProviders(),
                window.ai.getPrefs(),
            ]);
            if (cancelled) return;
            const chosen = list.find(p => p.id === prefs.providerId && p.available)
                ?? list.find(p => p.available)
                ?? null;
            setProvider(chosen);
            if (chosen) {
                const modelId = chosen.models.some(m => m.id === prefs.model)
                    ? prefs.model!
                    : chosen.models[0]?.id;
                setModel(modelId);
                const controls = chosen.models.find(m => m.id === modelId)?.controls ?? chosen.controls;
                const saved = prefs.settings[chosen.id] ?? {};
                setSettings(Object.fromEntries(controls.map(c => [c.id, saved[c.id] ?? c.default])));
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const generate = useCallback(async () => {
        if (!provider || !description.trim() || busy) return;
        setBusy(true);
        setProblem(null);
        const result = await window.ai.draftCommand({
            providerId: provider.id,
            model,
            settings,
            description: description.trim(),
            existing: existing ?? null,
        });
        setBusy(false);
        if (!result.ok || !result.command) {
            setProblem(result.detail ?? "Could not draft a command.");
            return;
        }
        onDraft(result.command, result.notes ?? []);
        setDescription("");
    }, [provider, description, busy, model, settings, existing, onDraft]);

    if (!provider) {
        return (
            <p className="text-[11px] text-white/25 leading-relaxed">
                Set up a provider in Settings → AI to draft commands from a description.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                    <Sparkles size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-300/40" />
                    <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); generate(); }
                            // Don't let Escape bubble out and close the section.
                            if (e.key === "Escape" && description) {
                                e.stopPropagation();
                                setDescription("");
                            }
                        }}
                        disabled={busy}
                        placeholder={placeholder ?? "Describe the command you want…"}
                        className="w-full h-8 pl-7 pr-3 rounded-md bg-white/[0.03] border border-white/[0.07] text-[11.5px] text-white/80 placeholder:text-white/25 outline-none focus:border-white/[0.16] transition-colors disabled:opacity-50"
                    />
                </div>
                <button
                    onClick={generate}
                    disabled={busy || !description.trim()}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-white/[0.07] border border-white/[0.08] text-[11px] text-white/70 hover:bg-white/[0.11] hover:text-white/90 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                >
                    {busy ? <Spinner className="size-3" /> : <CornerDownLeft size={12} />}
                    {busy ? "Drafting…" : existing ? "Rewrite" : "Draft"}
                </button>
            </div>

            <p className="flex items-center gap-1.5 text-[10px] text-white/20">
                <TriangleAlert size={10} className="shrink-0" />
                Drafted with {provider.label}. Read the script before saving — nothing runs until you do.
            </p>

            {problem && <p className="text-[10.5px] text-red-300/80">{problem}</p>}
        </div>
    );
}
