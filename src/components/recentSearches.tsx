import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { SearchHistoryT } from "@/interfaces/history.ts";
import { getSearchHistory, deleteHistoryEntry, openSearch } from "@/scripts/bangs.ts";

const VISIBLE_LIMIT = 5;

/**
 * Recent web searches on the empty-query home screen. Previously this only
 * existed inside the separate Web tab.
 */
export default function RecentSearches() {
    const [history, setHistory] = useState<SearchHistoryT[]>([]);

    useEffect(() => {
        let cancelled = false;
        getSearchHistory().then(items => {
            if (!cancelled) setHistory(items.slice(0, VISIBLE_LIMIT));
        });
        return () => { cancelled = true; };
    }, []);

    if (history.length === 0) return null;

    const handleDelete = async (entry: SearchHistoryT) => {
        const updated = await deleteHistoryEntry(entry);
        setHistory(updated.slice(0, VISIBLE_LIMIT));
    };

    return (
        <div className="px-4 pb-2">
            <div className="text-[10px] uppercase tracking-wide text-white/25 px-1 pb-1">
                Recent searches
            </div>
            <div className="flex flex-col">
                {history.map(item => (
                    <div
                        key={`${item.site}|${item.searchUrl}`}
                        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.06] transition-colors duration-150"
                    >
                        <button
                            onClick={() => openSearch(item)}
                            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer text-left"
                        >
                            <Search className="w-3.5 h-3.5 shrink-0 text-white/30" />
                            <span className="text-[12px] text-white/70 truncate">
                                {item.searchTerm || item.site}
                            </span>
                            <span className="text-[10px] text-white/25 shrink-0">{item.site}</span>
                        </button>
                        <button
                            onClick={() => handleDelete(item)}
                            aria-label={`Remove ${item.searchTerm} from recent searches`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 cursor-pointer p-0.5 rounded hover:bg-white/10"
                        >
                            <X className="w-3 h-3 text-white/40" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
