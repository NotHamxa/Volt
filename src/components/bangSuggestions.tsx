import { CSSProperties, useEffect, useState } from "react";
import { handleBangs } from "@/scripts/bangs.ts";

type BangSuggestionItemProps = {
    suggestion: string;
    highlighted: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
};

interface IBangSuggestions {
    bang: string;
    setQuery: (query: string) => void;
    selfQueryChanged: boolean;
}

export default function BangSuggestions({ bang, setQuery, selfQueryChanged }: IBangSuggestions) {
    const [suggestions, setSuggestions] = useState<string[]>(new Array(11).fill("")); // Start with 11 empty items
    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    function BangSuggestionItem({ suggestion, highlighted, onMouseEnter, onMouseLeave }: BangSuggestionItemProps) {
        return (
            <div
                tabIndex={0}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onClick={async () => {
                    await handleOpen(suggestion.replace(/<\/?b>/g, ''));
                }}
                style={{
                    padding: "8px",
                    borderRadius: "8px",
                    background: highlighted && suggestion!=="" ? "rgba(255, 255, 255, 0.1)" : "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "background 0.15s ease-in-out",
                    justifyContent: "space-between",
                    width: "100%",
                    margin: "0px 10px",
                    display: "flex",
                }}
            >
                <label dangerouslySetInnerHTML={{ __html: suggestion }} />
            </div>
        );
    }

    useEffect(() => {
        const checkBang = async () => {
            if (selfQueryChanged) return;

            const words = bang.trim().split(" ");
            const lastWord = words[words.length - 1];
            const hasBang = lastWord.startsWith("!");
            const searchTerm = hasBang ? words.slice(0, -1).join(" ") : bang;
            const newSuggestions = new Array(11).fill("");

            newSuggestions[0] = searchTerm;

            let googleSuggestions = await window.electron.getGoogleSuggestions(searchTerm);
            if (googleSuggestions.length > 0) {
                googleSuggestions = googleSuggestions.slice(0, 10);
                newSuggestions.splice(1, googleSuggestions.length, ...googleSuggestions);
            }

            setSuggestions(newSuggestions);
            setFocusedIndex(0);
        };

        checkBang();
    }, [bang]);

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            let newIndex = focusedIndex;
            let arrowUsed = false;

            if (e.key === 'ArrowDown') {
                newIndex = (focusedIndex + 1) % suggestions.length;
                arrowUsed = true;
            } else if (e.key === 'ArrowUp') {
                newIndex = (focusedIndex - 1 + suggestions.length) % suggestions.length;
                arrowUsed = true;
            } else if (e.key === 'Enter' && focusedIndex !== -1) {
                const suggestion = suggestions[newIndex] ? suggestions[newIndex] : "";
                await handleOpen(suggestion.replace(/<\/?b>/g, ''));
                return;
            }

            setFocusedIndex(newIndex);
            const currentSuggestion = suggestions[newIndex];

            if (currentSuggestion && arrowUsed) {
                setQuery(currentSuggestion.replace(/<\/?b>/g, ''));
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [focusedIndex, suggestions]);

    async function handleOpen(suggestion: string) {
        const words = bang.trim().split(" ");
        const lastWord = words[words.length - 1];
        const shortcut = lastWord.startsWith("!") ? lastWord.slice(1) : "g";
        const bangString: string = suggestion + " !" + shortcut;
        await handleBangs(bangString);
    }

    return (
        <div style={styles.mainContainer}>
            {suggestions.map((suggestion, index) => (
                <BangSuggestionItem
                    key={index}
                    suggestion={suggestion}
                    highlighted={index === focusedIndex || index === hoveredIndex}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                />
            ))}
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
