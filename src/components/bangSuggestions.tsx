import {useEffect, useState} from "react";
import {handleBangs, handleHistoryItem} from "@/scripts/bangs.ts";
import {SearchHistoryT} from "@/interfaces/history.ts";
import {X} from "lucide-react";

type BangSuggestionItemProps = {
    suggestion: string;
    highlighted: boolean;
};

type SearchHistoryItemProps = {
    historyItem: SearchHistoryT;
    highlighted: boolean;
    onDelete: (history:SearchHistoryT) => void;
};

interface IBangSuggestions {
    bang: string;
    setQuery: (query: string) => void;
    selfQueryChanged: boolean;
}

export default function BangSuggestions({bang, setQuery, selfQueryChanged}: IBangSuggestions) {
    const [suggestions, setSuggestions] = useState<string[]>(new Array(11).fill(""));
    const [searchHistory, setSearchHistory] = useState<SearchHistoryT[]>([]);
    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const [isHistory,setIsHistory] = useState<boolean>(false);


    function BangSuggestionItem({suggestion, highlighted}: BangSuggestionItemProps) {
        return (
            <div
                tabIndex={0}
                onClick={async () => {
                    await handleOpen(suggestion);
                }}
                className={`p-2 rounded-lg text-white cursor-pointer select-none transition-colors duration-150 justify-between w-full flex ${
                    highlighted && suggestion !== ""
                        ? "bg-white/10"
                        : suggestion !== "" ? "hover:bg-white/10" : ""
                }`}
            >
                <label dangerouslySetInnerHTML={{ __html: suggestion }} />
            </div>
        );
    }

    function SearchHistoryItem({historyItem, highlighted,onDelete}: SearchHistoryItemProps) {
        const [isHovered, setIsHovered] = useState(false);
        return (
            <div
                tabIndex={0}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`p-2 rounded-lg text-white cursor-pointer select-none transition-colors duration-150 justify-between w-full flex ${
                    highlighted && historyItem.searchTerm !== ""
                        ? "bg-white/10"
                        : historyItem.searchTerm !== "" ? "hover:bg-white/10" : ""
                }`}
            >
                <div
                    onClick={async () => {
                        await handleHistoryItem(historyItem);
                    }}
                    className="w-full flex flex-row justify-between items-center"
                >
                    <label className="overflow-hidden text-ellipsis whitespace-nowrap mr-3 max-w-[70%]">
                        {historyItem.searchTerm}
                    </label>
                    <div className="flex items-center whitespace-nowrap">
                        <small>{historyItem.site}</small>
                    </div>
                </div>
                {isHovered && (
                    <div
                        className="flex items-center"
                        onClick={()=>{
                            onDelete(historyItem);
                        }}
                    >
                        <X size={15}/>
                    </div>
                )}
            </div>

        );
    }

    useEffect(() => {
        const loadHistory = async () => {
            if (bang === "") {
                const searchHistory: SearchHistoryT[] =
                    JSON.parse(await window.electronStore.get("searchHistory")  || "[]");
                setSearchHistory(searchHistory);
                return;
            }
        }
        loadHistory()
        return () => {
            if (isHistory && bang !== "") {
                setIsHistory(false)
            }
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const checkBang = async () => {
            if (selfQueryChanged) return;
            if (bang === "") {
                const searchHistory: SearchHistoryT[] =
                    JSON.parse(await window.electronStore.get("searchHistory") || "[]");
                setSearchHistory(searchHistory);
                setIsHistory(true);
                return;
            }

            setIsHistory(false);
            const words = bang.trim().split(" ");
            const lastWord = words[words.length - 1];
            const hasBang = lastWord.startsWith("!");
            const searchTerm = hasBang ? words.slice(0, -1).join(" ") : bang;
            if (searchTerm !== "") {
                setSuggestions(prev => {
                    const updated = [...prev];
                    updated[0] = searchTerm;
                    return updated;
                });
                let googleSuggestions = await window.electron.getGoogleSuggestions(searchTerm);
                if (cancelled) return;

                if (googleSuggestions.length > 0) {
                    googleSuggestions = googleSuggestions.slice(0, 10);
                }
                setSuggestions(() => {
                    return [searchTerm, ...googleSuggestions];
                });
                setFocusedIndex(0);
            } else if (hasBang) {
                setSuggestions([bang]);
            }
        };

        checkBang();

        return () => {
            cancelled = true;
        };
    }, [bang]);


    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            let newIndex = focusedIndex;
            let arrowUsed = false;

            const filteredSuggestions = suggestions.filter((item) => item !== "");

            if (e.key === "ArrowDown") {
                newIndex = (focusedIndex + 1) % (isHistory ? searchHistory.length : filteredSuggestions.length);
                arrowUsed = true;
            }
            else if (e.key === "ArrowUp") {
                newIndex = (focusedIndex - 1 + (isHistory ? searchHistory.length : filteredSuggestions.length)) % (isHistory ? searchHistory.length : filteredSuggestions.length);
                arrowUsed = true;
            }
            else if (e.key === "Enter" && (isHistory ? searchHistory[newIndex] : filteredSuggestions[newIndex])) {
                const item = isHistory ? searchHistory[newIndex] : filteredSuggestions[newIndex];
                await handleOpen(item);
                return;
            }

            setFocusedIndex(newIndex);
            const currentItem = isHistory ? searchHistory[newIndex] : filteredSuggestions[newIndex];

            if (currentItem && arrowUsed) {
                if (typeof currentItem === "string") {
                    setIsHistory(false);
                    const words = bang.trim().split(" ");
                    const lastWord = words[words.length - 1];
                    const hasBang = lastWord.startsWith("!");
                    if (hasBang) {
                        setQuery(currentItem.replace(/<\/?b>/g, "") + " " + lastWord);
                    } else {
                        setQuery(currentItem.replace(/<\/?b>/g, ""));
                    }
                } else {
                    setIsHistory(true);
                    setQuery(currentItem.searchTerm);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [focusedIndex, suggestions, searchHistory]);

    const handleDeleteHistoryItem = async (history:SearchHistoryT) => {
        const updatedHistory = searchHistory.filter((item) => JSON.stringify(item) !== JSON.stringify(history));
        setSearchHistory(updatedHistory);
        window.electronStore.set("searchHistory", JSON.stringify(updatedHistory));
    };
    function isValidUrl(url: string): string | null {
        try {
            let normalizedUrl = url;

            if (!/^https?:\/\//i.test(url)) {
                // Default to http for localhost/127.0.0.1, otherwise https
                normalizedUrl = /^(localhost|127\.0\.0\.1)/i.test(url)
                    ? `http://${url}`
                    : `https://${url}`;
            }

            const parsed = new URL(normalizedUrl);
            const hostname = parsed.hostname;
            if (
                hostname === "localhost" ||
                /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || // IPv4
                hostname.includes(".") // normal domain
            ) {
                return normalizedUrl;
            }

            return null;
        } catch {
            return null;
        }
    }

    async function handleOpen(suggestion: string | SearchHistoryT) {

        if (typeof suggestion === "string") {
            suggestion = suggestion.replace(/<\/?b>/g, "")
            const words = bang.trim().split(" ");
            const lastWord = words[words.length - 1];
            const shortcut = lastWord.startsWith("!") ? lastWord.slice(1) : isValidUrl(suggestion)?"ds":"g";
            const bangString: string = suggestion + " !" + shortcut;
            if (suggestion==="!"+shortcut){
                await handleBangs(suggestion);
                return;
            }
            await handleBangs(bangString);
        }
        else{
            await handleHistoryItem(suggestion);
        }
    }

    return (
        <div className="w-full h-full px-4">
            {(bang === "" || isHistory) ? (
                searchHistory.length === 0 ? (
                    <div className="flex justify-center items-center h-full w-full text-white/20 text-[13px]">
                        No recent searches
                    </div>
                ) : (
                    searchHistory.slice(0,11).map((item, index) => (
                        <SearchHistoryItem
                            key={index}
                            historyItem={item}
                            highlighted={index === focusedIndex}
                            onDelete={handleDeleteHistoryItem}
                        />
                    ))
                )
            ) : (
                suggestions.map((item, index) => (
                    <BangSuggestionItem
                        key={index}
                        suggestion={item}
                        highlighted={index === focusedIndex}
                    />
                ))
            )}
        </div>

    );
}
