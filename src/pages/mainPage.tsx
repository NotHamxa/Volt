import { CSSProperties, useEffect, useState } from 'react';
import { Search } from "lucide-react";
import { motion } from 'framer-motion';
import { Input } from "@/components/ui/input.tsx";
import SearchQueryFilter from "@/components/searchQueryFilter.tsx";
import QuerySuggestions from "@/components/querySuggestions.tsx";
import BangSuggestions from "@/components/bangSuggestions.tsx";
import HomePageComponent from "@/components/homePageComponent.tsx";
import { getBangData } from "@/scripts/bangs.ts";
import { BangData } from "@/interfaces/bang.ts";

interface MainPageProps {
    inputRef: React.RefObject<HTMLInputElement | null>;
    stage: number;
    query: string;
    setQuery:React.Dispatch<React.SetStateAction<string>>;
}

export default function MainPage({ inputRef, stage, query, setQuery }: MainPageProps) {
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [selfQueryChanged, setSelfQueryChanged] = useState<boolean>(false);
    const [homePageStage, setHomePageStage] = useState<number>(1);
    const [searchQueryFilters, setSearchQueryFilters] = useState<boolean[]>([true, true, true, true, true]);

    useEffect(() => {
        const getData = async () => {
            if (query === "") {
                return;
            }
            if (query.includes("!") && stage === 2) {
                const bangData = await getBangData(query);
                setBangData(bangData);
                return;
            }
        };
        getData();
    }, [query, stage]);

    useEffect(() => {
        if (stage === 1 && selfQueryChanged) {
            setSelfQueryChanged(false);
        }
    }, [stage, selfQueryChanged]);

    const faviconUrl = bangData?.d
        ? `https://www.google.com/s2/favicons?sz=24&domain_url=${encodeURIComponent(bangData.d)}`
        : null;

    function setQueryInput(value: string) {
        setSelfQueryChanged(true);
        setQuery(value);
    }

    function SwitchModes() {
        return (
            <div className="flex items-center space-x-2 text-white/25 text-sm">
                <span>{stage === 1 ? "Web" : "Files"}</span>
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    Tab
                </span>
            </div>
        );
    }

    return (
        <>
            <div style={styles.inputContainer}>
                {faviconUrl && stage === 2 ? <img src={faviconUrl} style={styles.favicon} /> : <Search size={20} className="text-white/30 shrink-0" />}
                <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelfQueryChanged(false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                        }
                    }}
                    placeholder={stage === 1 ? "Search apps and documents" : "Search the web"}
                    style={styles.input}
                    autoFocus
                />
                {!query && <SwitchModes />}
                {query && stage === 1 ? <SearchQueryFilter
                    filters={searchQueryFilters}
                    setFilters={setSearchQueryFilters}
                /> : null}
            </div>
            <motion.div
                // key={stage}
                // initial={{ opacity: 0, x: stage === 1 ? -50 : 50 }}
                // animate={{ opacity: 1, x: 0 }}
                // exit={{ opacity: 0, x: stage === 1 ? 50 : -50 }}
                // transition={{ duration: 0.3, ease: "easeInOut" }}
                // style={{ flexGrow: 1 }}
            >
                {query.trim() && stage === 1 && homePageStage === 1 ? (
                    <QuerySuggestions
                        query={query.trim()}
                        searchFilters={searchQueryFilters}
                    />
                ) : null}

                {stage === 2 ? <BangSuggestions
                    bang={query.trim()}
                    setQuery={setQueryInput}
                    selfQueryChanged={selfQueryChanged}
                /> : null}
                {(
                    (query.trim() === "" && stage === 1) ||
                    (query.trim() !== "" && stage === 1 && homePageStage === 2)
                ) ? (
                    <HomePageComponent
                        stage={homePageStage}
                        setStage={setHomePageStage}
                        query={query.trim()}
                    />
                ) : null}
            </motion.div>
        </>
    );
}

const styles: { [key: string]: CSSProperties } = {
    input: {
        width: '100%',
        margin: '10px auto',
        display: 'block',
        borderWidth: '0px',
        backgroundColor: 'transparent',
    },
    inputContainer: {
        display: "flex",
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        padding: "0px 20px",
        borderBottomWidth: "1px",
        borderBottomStyle: "solid",
        borderBottomColor: 'rgba(255,255,255,0.07)',
        marginBottom: "5px",
    },
    favicon: {
        width: 24,
        height: 24,
    },
};