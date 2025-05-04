import { CSSProperties, useEffect, useRef, useState } from 'react';
import { Input } from "@/components/ui/input.tsx";
import { getQueryData } from "@/scripts/query.ts";
import {getBangData} from "@/scripts/bangs.ts";
import QuerySuggestions from "@/components/querySuggestions.tsx";
import {ChevronRight, Search} from "lucide-react";
import {BangData} from "@/interfaces/bang.ts";
import {Button} from "@/components/ui/button.tsx";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import SearchQueryFilter from "@/components/searchQueryFilter.tsx";
import BangSuggestions from "@/components/bangSuggestions.tsx";

function App() {
    const [query, setQuery] = useState('');
    const [usingBangs, setUsingBangs] = useState(false);
    const [bestMatch, setBestMatch] = useState<SearchQueryT | null>(null);
    const [apps, setApps] = useState<SearchQueryT[]>([]);
    const [folders, setFolders] = useState<SearchQueryT[]>([]);
    const [files, setFiles] = useState<SearchQueryT[]>([]);
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [selfQueryChanged,setSelfQueryChanged] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        document.documentElement.classList.add("dark");
        const handleBlur = () => {
            setQuery("");
            setUsingBangs(false);
            setBestMatch(null);
            setSelfQueryChanged(false)
            inputRef.current?.focus();
        };
        window.electron.onWindowBlurred(handleBlur);

        return () => {};
    }, []);

    useEffect(() => {
        const getData = async () => {
            if (query === "") {
                setBestMatch(null);
                setUsingBangs(false);
                return;
            }
            if (query.startsWith("!")) {
                setUsingBangs(true);
                const bangData = await getBangData(query);
                setBangData(bangData);
                return;
            }
            const queryData = await getQueryData({ query, setBestMatch });
            setApps(queryData.apps);
            setFolders(queryData.folders);
            setFiles(queryData.files);
        };
        getData();
    }, [query]);
    const faviconUrl = bangData?.d
        ? `https://www.google.com/s2/favicons?sz=24&domain_url=${encodeURIComponent(bangData.d)}`
        : null;
    function setQueryInput(value: string) {
        setSelfQueryChanged(true)
        setQuery(value);
    }
    return (
        <div style={styles.mainContainer}>
            <div style={styles.inputContainer}>
                {faviconUrl ? <img src={faviconUrl} style={styles.favicon}/>:<Search size={24}/>}
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
                    placeholder="Search for apps or Bangs"
                    style={styles.input}
                    autoFocus
                />
                {!usingBangs && query ? <SearchQueryFilter/>:null}
            </div>

            {!usingBangs && query ? (
                <QuerySuggestions
                    bestMatch={bestMatch}
                    apps={apps}
                    files={files}
                    folders={folders}

                />
            ) : null}

            {usingBangs && query ? <BangSuggestions
                bang={query}
                setQuery={setQueryInput}
                selfQueryChanged={selfQueryChanged}
            /> : null}
            {query===""?
                <>
                    <div style={{height: "350px"}}>
                        <div style={{
                            display: "flex",
                            color: "#ffffff",
                            fontWeight: "bold",
                            fontSize: "16px",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingRight: "10px",
                        }}>
                            <span style={{margin: "0 12px"}}>Pinned Apps</span>
                            <Button
                                variant="ghost"
                                className="bg-[#2b2b2b] hover:bg-[#3a3a3a] text-white px-3 py-1 h-auto text-sm rounded-md flex items-center gap-1"
                            >
                                All
                                <ChevronRight className="w-3 h-3"/>
                            </Button>
                        </div>

                    </div>
                    <div style={{height: "100%"}}>
                        <div style={{
                            display: "flex",
                            color: "#ffffff",
                            fontWeight: "bold",
                            fontSize: "16px",
                        }}>
                            <span style={{margin: "0 12px"}}>Suggested</span>
                        </div>
                        {/* Content below */}
                    </div>
                </> : null}
        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: '800px',
        maxWidth: '800px',
        height: '500px',
        overflow: 'hidden',
    },
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
        padding: "0px 20px"
    },
    favicon: {
        width: 24,
        height: 24,
    },

};

export default App;
