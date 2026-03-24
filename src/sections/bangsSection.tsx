import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { BangData } from "@/interfaces/bang.ts";
import allBangs from "@/data/bangs.json";

const POPULAR_TRIGGERS = ["g", "yt", "gh", "reddit", "w", "maps", "drive", "twitter", "amazon", "so", "npm", "mdn"];

const popularBangs = POPULAR_TRIGGERS
    .map(t => (allBangs as BangData[]).find(b => b.t === t))
    .filter(Boolean) as BangData[];

export default function QuickBangsSection() {
    const [bangSearch, setBangSearch] = useState("");

    const bangs = useMemo(() => {
        if (!bangSearch.trim()) return null;
        return (allBangs as BangData[]).filter(b =>
            b.s.toLowerCase().includes(bangSearch.toLowerCase()) ||
            b.t.toLowerCase().includes(bangSearch.toLowerCase())
        );
    }, [bangSearch]);

    const displayBangs = bangs ?? (bangSearch ? [] : popularBangs);
    const showingPopular = !bangs && !bangSearch;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-[22px] font-semibold text-white tracking-[-0.03em] mb-1.5">Quick Bangs</h2>
                <p className="text-white/40 text-[13px]">
                    Use shortcuts like <code className="text-white/60">!g</code> or <code className="text-white/60">!yt</code> to search specific sites.
                </p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={16} />
                <input
                    value={bangSearch}
                    placeholder="Search over 10,000 shortcuts (e.g. Google, GitHub...)"
                    onChange={(e) => setBangSearch(e.target.value)}
                    className="w-full h-10 pl-10 pr-3 text-[13px] rounded-xl bg-white/[0.04] border border-white/8 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
                />
            </div>

            <ScrollArea className="rounded-xl p-2 max-h-[500px] border border-white/[0.06]">
                <div className="grid grid-cols-1 gap-1">
                    {showingPopular && (
                        <div className="px-3 py-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/20">Popular</span>
                        </div>
                    )}
                    {displayBangs.map((bang, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors cursor-default hover:bg-white/[0.04]">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[13px] font-medium text-white/75">{bang.s}</span>
                                <span className="text-[10px] text-white/25 uppercase tracking-tight">{bang.d || 'Search Provider'}</span>
                            </div>
                            <div className="px-2 py-0.5 rounded-md font-mono text-[11px] text-white/45 bg-white/[0.06] border border-white/[0.09]">
                                !{bang.t}
                            </div>
                        </div>
                    ))}
                    {bangs && bangs.length === 0 && (
                        <div className="p-8 text-center text-white/25 text-[13px]">No matching bangs found.</div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
