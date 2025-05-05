import {CSSProperties, useEffect, useRef, useState} from 'react';
import {Search} from "lucide-react";
import {Input} from "@/components/ui/input.tsx";
import SearchQueryFilter from "@/components/searchQueryFilter.tsx";
import {getBangData} from "@/scripts/bangs.ts";
import {BangData} from "@/interfaces/bang.ts";
import QuerySuggestions from "@/components/querySuggestions.tsx";
import BangSuggestions from "@/components/bangSuggestions.tsx";
import HomePageComponent from "@/pages/homePageComponent.tsx";

function App() {
    const [query, setQuery] = useState('');
    const [usingBangs, setUsingBangs] = useState(false);
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [selfQueryChanged,setSelfQueryChanged] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        document.documentElement.classList.add("dark");
        const handleBlur = () => {
            setQuery("");
            setUsingBangs(false);
            setSelfQueryChanged(false)
            inputRef.current?.focus();
            setBangData(null);
        };
        window.electron.onWindowBlurred(handleBlur);

        return () => {};
    }, []);

    useEffect(() => {
        const getData = async () => {
            if (query === "") {
                setUsingBangs(false);
                return;
            }
            if (query.startsWith("!")) {
                setUsingBangs(true);
                const bangData = await getBangData(query);
                setBangData(bangData);
                return;
            }
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
        <div style={styles.wrapper}>
            <div style={styles.inputContainer}>
                {faviconUrl ? <img src={faviconUrl} style={styles.favicon}/> : <Search size={24}/>}
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
                {!usingBangs && query ? <SearchQueryFilter/> : null}
            </div>


            {!usingBangs && query ? (
                <QuerySuggestions
                    query={query}
                />
            ) : null}

            {usingBangs && query ? <BangSuggestions
                bang={query}
                setQuery={setQueryInput}
                selfQueryChanged={selfQueryChanged}
            /> : null}
            {query===""?<HomePageComponent/>:null}

        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    wrapper: {
        width: '800px',
        height: '500px',
        overflow: 'hidden',
        background: "rgba(10,10,10,0.9)",
    },
    mainContainer: {
        width: '800px',
        maxWidth: '800px',
        height: '500px',
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
        padding: "0px 20px",
        borderBottomWidth:"1px",
        borderBottomStyle: "solid",
        borderBottomColor: 'white',
        marginBottom: "5px",
    },
    favicon: {
        width: 24,
        height: 24,
    },
};

export default App;
