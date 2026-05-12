import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { tips, TipCategory } from "@/data/tips";
import { Toggle } from "@/components/settingsLayout.tsx";

const CATEGORY_ORDER: TipCategory[] = ["Shortcut", "Search", "Apps", "Files", "Web", "Commands"];

export default function TipsSection() {
    const [q, setQ] = useState("");
    const [tipsEnabled, setTipsEnabled] = useState<boolean>(true);

    useEffect(() => {
        (async () => {
            const disabled = await window.electronStore.get("tipsDisabled");
            setTipsEnabled(disabled !== "true");
        })();
    }, []);

    const toggleTips = () => {
        const next = !tipsEnabled;
        setTipsEnabled(next);
        window.electronStore.set("tipsDisabled", next ? "false" : "true");
        if (next) {
            // re-enable session display too
            sessionStorage.removeItem("voltTipDismissed");
        }
    };

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return tips;
        return tips.filter(t =>
            t.title.toLowerCase().includes(needle) ||
            t.body.toLowerCase().includes(needle) ||
            t.category.toLowerCase().includes(needle) ||
            (t.keys ?? []).some(k => k.toLowerCase().includes(needle))
        );
    }, [q]);

    const grouped = useMemo(() => {
        const map = new Map<TipCategory, typeof tips>();
        for (const t of filtered) {
            const arr = map.get(t.category) ?? [];
            arr.push(t);
            map.set(t.category, arr);
        }
        return CATEGORY_ORDER
            .map(c => [c, map.get(c) ?? []] as const)
            .filter(([, list]) => list.length > 0);
    }, [filtered]);

    return (
        <div className="space-y-5">
            <p className="text-[12px] text-white/40 leading-relaxed">
                Hidden tricks to get the most out of Volt.
            </p>

            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05]">
                <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-white/80">Show tip on home view</p>
                    <p className="text-[11px] text-white/35 mt-0.5 leading-relaxed">A small "Did you know?" banner cycles through these tips on the home screen.</p>
                </div>
                <Toggle checked={tipsEnabled} onChange={toggleTips} />
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={14} />
                <input
                    value={q}
                    placeholder="Search tips, shortcuts, keys..."
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 text-[12px] rounded-md bg-white/[0.03] border border-white/[0.06] text-white/75 placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] transition-colors"
                />
            </div>

            <ScrollArea className="max-h-[480px] pr-1">
                <div className="space-y-5">
                    {grouped.length === 0 && (
                        <div className="text-center text-white/30 text-[12px] py-10">
                            No tips match "{q}".
                        </div>
                    )}
                    {grouped.map(([category, list]) => (
                        <div key={category}>
                            <div className="px-1 mb-1.5">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/[0.22]">{category}</span>
                            </div>
                            <div className="space-y-1">
                                {list.map(t => (
                                    <div
                                        key={t.id}
                                        className="flex items-start justify-between gap-4 px-3.5 py-2.5 rounded-md bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.09] transition-colors"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12px] font-medium text-white/85 mb-0.5">{t.title}</p>
                                            <p className="text-[11px] text-white/45 leading-relaxed">{t.body}</p>
                                        </div>
                                        {t.keys && (
                                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                                {t.keys.map((k, i) => (
                                                    <span
                                                        key={i}
                                                        className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-white/[0.06] border border-white/[0.09] text-white/55 font-mono"
                                                    >
                                                        {k}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
