import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronRight, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";

/**
 * Provider and model in one control: a rail of providers beside a searchable
 * list of their models.
 *
 * Two dropdowns meant picking a provider before you could see what it offered,
 * and one vendor's catalogue runs to dozens of entries — far past what a select
 * can show usefully. Search is the way through a list that long; the collapsed
 * tail keeps the common case short without hiding anything.
 */

/** Beyond this the rest go behind a disclosure, so the list opens readable. */
const SHOWN_BY_DEFAULT = 10;

/** Providers have no artwork, so a short monogram stands in. */
function monogram(label: string) {
    const words = label.replace(/[()]/g, "").split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return label.slice(0, 2).toUpperCase();
}

export function ModelPicker({ providers, providerId, model, onSelect }: {
    providers: AiProviderInfo[];
    providerId: string;
    model: string;
    onSelect: (providerId: string, modelId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [browsing, setBrowsing] = useState(providerId);
    const [search, setSearch] = useState("");
    const [showAll, setShowAll] = useState(false);
    const [active, setActive] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const current = providers.find(p => p.id === providerId) ?? null;
    const shown = providers.find(p => p.id === browsing) ?? current;
    const currentLabel = current?.models.find(m => m.id === model)?.label ?? model ?? "Model";

    // Reopening starts from the provider in use, not wherever the last browse
    // happened to end. Done on the event rather than in an effect, so opening
    // costs one render instead of two.
    const setOpenState = (next: boolean) => {
        setOpen(next);
        if (!next) return;
        setBrowsing(providerId);
        setSearch("");
        setShowAll(false);
        setActive(0);
    };

    const matches = useMemo(() => {
        const term = search.trim().toLowerCase();
        const all = shown?.models ?? [];
        if (!term) return all;
        return all.filter(m =>
            m.label.toLowerCase().includes(term) || m.id.toLowerCase().includes(term));
    }, [shown, search]);

    // A typed id that isn't in the list is offered verbatim, rather than
    // leaving "no models match" as a dead end.
    const typed = search.trim();
    const exactId = typed && !matches.some(m => m.id === typed) ? typed : null;

    // Searching means you're looking for something specific; don't hide any of it.
    const collapsed = !search.trim() && !showAll && matches.length > SHOWN_BY_DEFAULT;
    const visible = collapsed ? matches.slice(0, SHOWN_BY_DEFAULT) : matches;

    // Keep the highlighted row in view as the arrows move it.
    useEffect(() => {
        listRef.current
            ?.querySelectorAll("[data-model-row]")[active]
            ?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const choose = (modelId: string) => {
        if (shown) onSelect(shown.id, modelId);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpenState}>
            <PopoverTrigger asChild>
                <button
                    aria-label="Choose a model"
                    className="flex items-center gap-1 h-6 max-w-[190px] px-1.5 rounded-md text-[10.5px] font-medium text-white/45 hover:bg-white/[0.07] hover:text-white/80 aria-expanded:bg-white/[0.07] aria-expanded:text-white/80 transition-colors cursor-pointer"
                >
                    <span className="truncate">{currentLabel}</span>
                    <ChevronRight size={11} className="shrink-0 rotate-90 text-white/30" />
                </button>
            </PopoverTrigger>

            <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-[400px] p-0 overflow-hidden rounded-xl border-white/[0.09] bg-[rgba(18,18,20,0.98)] backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
            >
                <div className="flex h-[300px]">
                    {/* Provider rail. Switching here re-filters the list rather
                        than committing, so you can look before choosing. */}
                    <div className="w-11 shrink-0 flex flex-col items-center gap-1 py-2 border-r border-white/[0.06]">
                        {providers.map(p => {
                            const isBrowsing = shown?.id === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => { setBrowsing(p.id); setShowAll(false); setActive(0); }}
                                    title={p.available ? p.label : `${p.label} — unavailable`}
                                    aria-label={p.label}
                                    className={`relative flex items-center justify-center w-7 h-7 rounded-lg text-[9.5px] font-semibold transition-colors cursor-pointer ${
                                        isBrowsing
                                            ? "bg-white/[0.1] text-white/85"
                                            : "text-white/30 hover:bg-white/[0.06] hover:text-white/70"
                                    } ${p.available ? "" : "opacity-40"}`}
                                >
                                    {isBrowsing && (
                                        <span className="absolute -left-1.5 h-4 w-[2px] rounded-full bg-sky-400/70" />
                                    )}
                                    {monogram(p.label)}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col">
                        <div className="relative shrink-0 border-b border-white/[0.06]">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setActive(0); }}
                                onKeyDown={(e) => {
                                    if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        setActive(i => Math.min(i + 1, visible.length - 1));
                                    } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setActive(i => Math.max(i - 1, 0));
                                    } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        // Falls through to a typed id when the
                                        // search matched nothing in the list.
                                        const pick = visible[active]?.id ?? exactId;
                                        if (pick) choose(pick);
                                    } else if (e.key === "Escape") {
                                        // Close the picker only; the launcher's
                                        // own handler would leave the AI view.
                                        e.stopPropagation();
                                        setOpen(false);
                                    }
                                }}
                                placeholder="Search models…"
                                className="w-full h-9 pl-8 pr-3 bg-transparent text-[12px] text-white/85 placeholder:text-white/25 outline-none"
                            />
                        </div>

                        <ScrollArea className="flex-1 min-h-0" ref={listRef}>
                            <div className="p-1">
                                {shown && !shown.available && (
                                    <p className="px-2 py-2 text-[10.5px] text-amber-300/60 leading-relaxed">
                                        {shown.detail ?? "This provider isn't set up yet."}
                                    </p>
                                )}

                                {visible.length === 0 && !exactId && (
                                    <p className="px-2 py-3 text-[11px] text-white/25">No models match.</p>
                                )}

                                {visible.map((m, i) => {
                                    const selected = shown?.id === providerId && m.id === model;
                                    return (
                                        <button
                                            key={m.id}
                                            data-model-row
                                            onMouseEnter={() => setActive(i)}
                                            onClick={() => choose(m.id)}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                                                i === active ? "bg-white/[0.07]" : ""
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <span className="block truncate text-[12px] text-white/85">{m.label}</span>
                                                <span className="block truncate text-[10px] text-white/30 mt-px">
                                                    {/* The wire id where the label is
                                                        an alias, so "Opus" says which
                                                        version it resolves to. */}
                                                    {m.detail ?? shown?.label}
                                                </span>
                                            </div>
                                            {selected && <Check size={12} className="shrink-0 text-sky-300/80" />}
                                        </button>
                                    );
                                })}


                                {/* Providers accept ids they don't advertise —
                                    the Claude CLI lists five aliases but takes
                                    any model name. Typing one reaches the older
                                    versions without a hard-coded list here that
                                    would fall out of date. */}
                                {exactId && (
                                    <button
                                        onClick={() => choose(exactId)}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.06] transition-colors cursor-pointer"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className="block truncate text-[12px] text-white/75">
                                                Use “{exactId}”
                                            </span>
                                            <span className="block truncate text-[10px] text-white/30 mt-px">
                                                Any model id {shown?.label} accepts
                                            </span>
                                        </div>
                                    </button>
                                )}

                                {collapsed && (
                                    <button
                                        onClick={() => setShowAll(true)}
                                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className="block text-[12px] text-white/70">Older models</span>
                                            <span className="block text-[10px] text-white/30 mt-px">
                                                {matches.length - SHOWN_BY_DEFAULT} more
                                            </span>
                                        </div>
                                        <ChevronRight size={13} className="shrink-0 text-white/30" />
                                    </button>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
