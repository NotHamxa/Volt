import { CSSProperties, useEffect, useState } from "react";
import {getBangData, handleBangs} from "@/scripts/bangs.ts";
import { BangData } from "@/interfaces/bang.ts";
type BangSuggestionItemProps = {
    suggestion: string;
    highlighted: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
};

interface IBangSuggestions {
    bang:string,
    setQuery: (query: string) => void,
    selfQueryChanged:boolean
}

export default function BangSuggestions({ bang, setQuery, selfQueryChanged }: IBangSuggestions) {
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    function BangSuggestionItem({ suggestion, highlighted, onMouseEnter, onMouseLeave }: BangSuggestionItemProps) {
        return (
            <div
                tabIndex={0}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onClick={async ()=>{
                    await handleOpen(suggestion)
                }}
                style={{
                    padding: "8px",
                    borderRadius: "8px",
                    background: highlighted ? "rgba(255, 255, 255, 0.1)" : "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "background 0.15s ease-in-out",
                    justifyContent:"space-between",
                    width: "100%",
                    margin:"0px 10px",
                    display: "flex",
                }}
            >
                <label>{suggestion}</label>
                {/*<label>{bangData?.s?bangData.s:""}</label>*/}
            </div>
        );
    }
    useEffect(() => {
        const checkBang = async () => {
            if (selfQueryChanged)
                return;
            const bangData = await getBangData(bang);
            setBangData(bangData);
            if (bangData) {
                const searchTerm = bang.slice(bangData.t.length + 1).trim();
                if (searchTerm !== "") {
                    setSuggestions([searchTerm])
                    let googleSuggestions = await window.electron.getGoogleSuggestions(searchTerm)
                    if (googleSuggestions.length>0){
                        googleSuggestions = googleSuggestions.length>10?googleSuggestions.slice(0,10):googleSuggestions;
                        setSuggestions([searchTerm,...googleSuggestions]);
                    }

                    setFocusedIndex(0);
                }
                else{
                    setSuggestions([])
                }
            } else {

                setSuggestions([]);
            }
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
                const suggestion = suggestions[newIndex] ? " " + suggestions[newIndex] : ""
                await handleOpen(suggestion);
                return;
            }

            setFocusedIndex(newIndex);
            const currentSuggestion = suggestions[newIndex];
            if (currentSuggestion && arrowUsed)
            {
                setQuery("!"+bangData?.t+" "+currentSuggestion);
            }

        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [focusedIndex, suggestions]);
    async function handleOpen(suggestion:string){
        const bData = await getBangData(bang);
        if (bData) {
            const bangString:string = "!" + bData?.t + " "+suggestion;
            await handleBangs(bangString);
        }
        else{
            const bangString:string = "!g"+" "+suggestion;
            await handleBangs(bangString);
        }

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
