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
                <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">Quick Bangs</h2>
                <p className="text-gray-400 text-sm">
                    Use shortcuts like <code className="text-blue-400">!g</code> or <code className="text-blue-400">!yt</code> to search specific sites.
                </p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
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
                    className="pl-10 h-12 bg-white/5 border-white/10 rounded-xl focus:ring-blue-500/50"
                />
            </div>

            <ScrollArea className="rounded-xl border border-white/5 bg-white/1 p-2 max-h-[500px]">
                <div className="grid grid-cols-1 gap-2">
                    {bangs?.map((bang, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-200">{bang.s}</span>
                                <span className="text-[10px] text-gray-500 uppercase tracking-tight">{bang.d || 'Search Provider'}</span>
                            </div>
                            <div className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono text-xs">
                                !{bang.t}
                            </div>
                        </div>
                    ))}
                    {!bangs && bangSearch && <div className="p-8 text-center text-gray-500 text-sm">No matching bangs found.</div>}
                    {!bangSearch && <div className="p-8 text-center text-gray-500 text-sm italic">Type above to search over 10,000 shortcuts.</div>}
                </div>
            </ScrollArea>
        </div>
    );
}