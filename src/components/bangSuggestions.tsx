import {CSSProperties, useEffect, useState} from "react";
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
        const [isHovered, setIsHovered] = useState(false);
        return (

            <div
                tabIndex={0}
                onClick={async () => {
                    await handleOpen(suggestion);
                }}
                onMouseEnter={() => {
                    setIsHovered(true);
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                }}
                style={{
                    padding: "8px",
                    borderRadius: "8px",
                    background:
                        (highlighted || isHovered) && suggestion !== ""
                            ? "rgba(255, 255, 255, 0.1)"
                            : "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "background 0.15s ease-in-out",
                    justifyContent: "space-between",
                    width: "100%",
                    display: "flex",
                }}
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
                onMouseEnter={() => {
                    setIsHovered(true);
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                }}
                style={{
                    padding: "8px",
                    borderRadius: "8px",
                    background: (highlighted || isHovered) && historyItem.searchTerm !== ""
                        ? "rgba(255, 255, 255, 0.1)"
                        : "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "background 0.15s ease-in-out",
                    justifyContent: "space-between",
                    width: "100%",
                    display: "flex",
                }}
            >
                <div
                    onClick={async () => {
                        await handleHistoryItem(historyItem);
                    }}
                    style={{
                        width: "100%",
                        justifyContent: "space-between",
                        flexDirection: "row",
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <label
                        style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginRight: "12px",
                            maxWidth: "70%",
                        }}
                    >
                        {historyItem.searchTerm}
                    </label>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            whiteSpace: "nowrap",
                        }}
                    >
                        <small>{historyItem.site}</small>
                    </div>
                </div>
                {isHovered && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                        }}
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
        <div style={styles.mainContainer}>
            {(bang === "" || isHistory) ? (
                searchHistory.length === 0 ? (
                    <div style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "100%",
                        width: "100%",
                        color: "#888",
                        fontSize: "14px"
                    }}>
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

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: "100%",
        height: "100%",
        padding: "0 16px",
        boxSizing: "border-box",
    },
};
