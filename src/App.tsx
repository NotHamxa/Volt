import {CSSProperties, useEffect, useRef, useState} from 'react';
import {Search} from "lucide-react";
import { FaGithub } from "react-icons/fa6";

import {Input} from "@/components/ui/input.tsx";
import SearchQueryFilter from "@/components/searchQueryFilter.tsx";
import {getBangData} from "@/scripts/bangs.ts";
import {BangData} from "@/interfaces/bang.ts";
import QuerySuggestions from "@/components/querySuggestions.tsx";
import BangSuggestions from "@/components/bangSuggestions.tsx";
import HomePageComponent from "@/pages/homePageComponent.tsx";
import { motion } from 'framer-motion';
import HelpPage from "@/components/modal/helpPage.tsx";
import {Toaster} from "@/components/ui/sonner.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Progress} from "@/components/ui/progress.tsx";

function App() {

    const [cacheLoadingStatus, setCacheLoadingStatus] = useState<boolean>(false);
    const [currentCacheStep,setCurrentCacheStep] = useState<number>(0);
    const [totalCacheSteps,setTotalCacheSteps] = useState<number>(0);

    const [query, setQuery] = useState('');
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [selfQueryChanged,setSelfQueryChanged] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [stage,setStage] = useState<number>(1);
    const [homePageStage,setHomePageStage] = useState<number>(1);
    const [helpModalOpen,setHelpModalOpen] = useState(false);

    const [searchQueryFilters,setSearchQueryFilters] = useState<boolean[]>([true, true, true, true]);

    window.onerror = function (msg, url, line, col, error) {
        console.error("GLOBAL ERROR CAUGHT:");
        console.error(msg, url, line, col, error);
    };

    useEffect(() => {
        document.documentElement.classList.add("dark");
        const handleBlur = () => {
            setQuery("");
            setSelfQueryChanged(false);
            inputRef.current?.focus();
            setBangData(null);
            setHelpModalOpen(false);
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Tab") {
                e.preventDefault();
                console.log("Tab", stage);
                setStage(prev => (prev === 1 ? 2 : 1));
                inputRef.current?.focus()
            }

            if (e.ctrlKey && e.key.toLowerCase() === "h") {
                e.preventDefault();
                setHelpModalOpen(!helpModalOpen);
            }
        };
        window.electron.onWindowBlurred(handleBlur);
        window.addEventListener("keydown", handleKeyDown);
        const handleCacheLoadedEvent = ()=>{
            setCacheLoadingStatus(false);
        }
        const getCacheLoadingStatus = async ()=>{
            const status = await window.electron.getCacheLoadingStatus()
            if (status){
                window.electron.onCacheLoaded(handleCacheLoadedEvent)
                window.electron.setCacheLoadingBar((currentStep,totalSteps)=>{
                    setCurrentCacheStep(currentStep)
                    setTotalCacheSteps(totalSteps)
                })
            }
            console.log(status)
            setCacheLoadingStatus(status);
        }
        const handleShortcutModalOpen = ()=>{
            window.removeEventListener("keydown", handleKeyDown);

        }
        const handleShortcutModalClose = ()=>{
            window.addEventListener("keydown", handleKeyDown);
        }

        window.addEventListener("shortcutModalOpen",handleShortcutModalOpen)
        window.addEventListener("shortcutModalClose",handleShortcutModalClose)



        getCacheLoadingStatus();
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("shortcutModalOpen", handleShortcutModalOpen);
            window.removeEventListener("shortcutModalClose", handleShortcutModalClose);
        };
    }, []);

    useEffect(() => {
        const getData = async () => {
            if (query === "") {
                return;
            }
            if (query.includes("!") && stage===2) {
                const bangData = await getBangData(query);
                setBangData(bangData);
                return;
            }
        };
        getData();
    }, [query]);
    useEffect(()=>{
        if (stage===1 && selfQueryChanged){
            setSelfQueryChanged(false);
        }
    },[stage])

    function SwitchModes() {
        return (
            <div className="flex items-center space-x-2 text-gray-400 text-sm">
                <span>{stage === 1 ? "Web" : "Files"}</span>
                <span className="px-2 py-0.5 text-xs border border-gray-500 rounded-sm">
        Tab
      </span>
            </div>
        );
    }
    const faviconUrl = bangData?.d
        ? `https://www.google.com/s2/favicons?sz=24&domain_url=${encodeURIComponent(bangData.d)}`
        : null;
    function setQueryInput(value: string) {
        setSelfQueryChanged(true)
        setQuery(value);
    }

    if (cacheLoadingStatus) {
        return (
            <div style={styles.cacheLoading}>
                <Label style={styles.cacheLabel}>App data loading, please wait...</Label>
                <Progress
                    value={Math.trunc((currentCacheStep/totalCacheSteps)*100)}
                    style={{width:"60%"}}
                />
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            <Toaster/>
            <HelpPage helpModalOpen={helpModalOpen} setHelpModalOpen={setHelpModalOpen}/>
            <div style={styles.inputContainer}>
                {faviconUrl && stage === 2 ? <img src={faviconUrl} style={styles.favicon}/> : <Search size={24}/>}
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
                {!query && <SwitchModes/>}
                {query && stage === 1 ? <SearchQueryFilter
                    filters={searchQueryFilters}
                    setFilters={setSearchQueryFilters}
                /> : null}
            </div>
            <motion.div
                key={stage}
                initial={{opacity: 0, x: stage === 1 ? -50 : 50}}
                animate={{opacity: 1, x: 0}}
                exit={{opacity: 0, x: stage === 1 ? 50 : -50}}
                transition={{duration: 0.3, ease: "easeInOut"}}
                style={{ flexGrow: 1}}
            >
                {query && stage === 1 && homePageStage===1? (
                    <QuerySuggestions
                        query={query}
                        searchFilters={searchQueryFilters}
                    />
                ) : null}

                {stage === 2 ? <BangSuggestions
                    bang={query}
                    setQuery={setQueryInput}
                    selfQueryChanged={selfQueryChanged}
                /> : null}
                {(
                    (query === "" && stage === 1) ||
                    (query !== "" && stage === 1 && homePageStage === 2)
                ) ? (
                    <HomePageComponent
                        stage={homePageStage}
                        setStage={setHomePageStage}
                        query={query}
                    />
                ) : null}
            </motion.div>
            <div
                style={{
                    borderTopStyle: "solid",
                    borderTopColor: "white",
                    borderTopWidth: "1px",
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "16px",
                    justifyContent: "space-between",
                    padding: "0px 16px",
                    width: "800px",
                }}
            >
                <button
                    className="text-gray-400 hover:text-white"
                    onClick={async ()=>{
                        window.electron.openExternal("https://github.com/NotHamxa")
                    }}
                >
                    <FaGithub size={20} />
                </button>
                <div className="flex items-center space-x-2 text-gray-400 text-sm">
                    <button
                        onClick={() => {
                            setHelpModalOpen(true);
                        }}
                        className="hover:underline cursor-pointer"
                    >
                        Settings
                    </button>
                    <span className="px-2 py-0.5 text-xs border border-gray-500 rounded-sm">Ctrl</span>
                    <span>+</span>
                    <span className="px-2 py-0.5 text-xs border border-gray-500 rounded-sm">H</span>
                </div>
            </div>

        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    wrapper: {
        width: '800px',
        height: '550px',
        overflow: 'hidden',
        background: "rgba(24, 24, 27,.99)",
        display: 'flex',
        flexDirection: 'column'
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
    cacheLoading: {
        width: '800px',
        height: '550px',
        background: "rgba(24, 24, 27, .99)",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
    },

    cacheLabel: {
        fontSize: '18px',
        color: '#ffffff',
        fontWeight: '500',
    },
};

export default App;
