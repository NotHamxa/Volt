import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { BangData } from "@/interfaces/bang.ts";
import allBangs from "@/data/bangs.json";

export default function QuickBangsSection() {
    const [bangSearch, setBangSearch] = useState<string>("");
    const [bangs, setBangs] = useState<BangData[] | null>(null);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
                <h2 className="text-[22px] font-semibold text-white tracking-[-0.03em] mb-1.5">Quick Bangs</h2>
                <p className="text-white/40 text-[13px]">
                    Use shortcuts like <code className="text-white/60">!g</code> or <code className="text-white/60">!yt</code> to search specific sites.
                </p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={16} />
                <Input
                    value={bangSearch}
                    placeholder="Search available shortcuts (e.g. Google, GitHub...)"
                    onChange={(e) => {
                        const query = e.target.value;
                        setBangSearch(query);
                        setBangs(query.trim() ?
                            allBangs.filter(b => b.s.toLowerCase().includes(query.toLowerCase())) as BangData[]
                            : null
                        );
                    }}
                    className="pl-10 h-10 text-[13px] rounded-xl focus:ring-white/15 bg-white/[0.04] border border-white/8"
                />
            </div>

            <ScrollArea className="rounded-xl p-2 max-h-[500px] border border-white/[0.06]">
                <div className="grid grid-cols-1 gap-1">
                    {bangs?.map((bang, i) => (
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
                    {!bangs && bangSearch && <div className="p-8 text-center text-white/25 text-[13px]">No matching bangs found.</div>}
                    {!bangSearch && <div className="p-8 text-center text-white/20 text-[13px]">Type above to search over 10,000 shortcuts.</div>}
                </div>
            </ScrollArea>
        </div>
    );
}
