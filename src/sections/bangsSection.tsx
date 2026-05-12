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
        <div className="space-y-5">
            <p className="text-[12px] text-white/40 leading-relaxed">
                Use shortcuts like <code className="text-white/65 font-mono text-[11px]">!g</code> or <code className="text-white/65 font-mono text-[11px]">!yt</code> to search specific sites.
            </p>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={14} />
                <input
                    value={bangSearch}
                    placeholder="Search over 10,000 shortcuts (e.g. Google, GitHub...)"
                    onChange={(e) => setBangSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 text-[12px] rounded-md bg-white/[0.03] border border-white/[0.06] text-white/75 placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] transition-colors"
                />
            </div>

            <ScrollArea className="rounded-md p-1 max-h-[480px] border border-white/[0.05] bg-white/[0.012]">
                <div className="grid grid-cols-1 gap-0.5">
                    {showingPopular && (
                        <div className="px-3 pt-2 pb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/[0.22]">Popular</span>
                        </div>
                    )}
                    {displayBangs.map((bang, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 rounded-sm transition-colors cursor-default hover:bg-white/[0.04]">
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[12px] font-medium text-white/75 truncate">{bang.s}</span>
                                <span className="text-[10px] text-white/25 uppercase tracking-tight">{bang.d || 'Search Provider'}</span>
                            </div>
                            <div className="px-1.5 py-0.5 rounded font-mono text-[10px] text-white/55 bg-white/[0.06] border border-white/[0.09] shrink-0 ml-3">
                                !{bang.t}
                            </div>
                        </div>
                    ))}
                    {bangs && bangs.length === 0 && (
                        <div className="p-8 text-center text-white/25 text-[12px]">No matching bangs found.</div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
