import { CSSProperties, useEffect, useState } from 'react';
import { Search } from "lucide-react";
import { Outlet, useLocation } from 'react-router-dom';
import { Input } from "@/components/ui/input.tsx";
import SearchQueryFilter from "@/components/searchQueryFilter.tsx";
import { getBangData } from "@/scripts/bangs.ts";
import { BangData } from "@/interfaces/bang.ts";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import { showToast } from "@/components/toast.tsx";

export type MainLayoutContext = {
    apps: SearchQueryT[];
    pinnedApps: SearchQueryT[];
    setPinnedApps: React.Dispatch<React.SetStateAction<SearchQueryT[]>>;
    pinApp: (app: SearchQueryT) => void;
    unPinApp: (app: SearchQueryT) => void;
    searchFilters: boolean[];
    setSearchFilters: React.Dispatch<React.SetStateAction<boolean[]>>;
};

const isSameApp = (a: SearchQueryT, b: SearchQueryT) =>
    a.appId === b.appId && a.path === b.path && a.name === b.name && a.type === b.type && a.source === b.source;

interface MainLayoutProps {
    inputRef: React.RefObject<HTMLInputElement | null>;
    stage: number;
    query: string;
    setQuery: React.Dispatch<React.SetStateAction<string>>;
    selfQueryChangedRef: React.MutableRefObject<boolean>;
}

export default function MainLayout({ inputRef, stage, query, setQuery, selfQueryChangedRef }: MainLayoutProps) {
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [searchFilters, setSearchFilters] = useState<boolean[]>([true, true, true, true, true]);
    const [apps, setApps] = useState<SearchQueryT[]>([]);
    const [pinnedApps, setPinnedApps] = useState<SearchQueryT[]>([]);
    const location = useLocation();

    useEffect(() => {
        const getAppData = async () => {
            const appsData = await window.apps.searchApps("");
            setApps(appsData);
            const pApps = await window.electronStore.get("pinnedApps");
            setPinnedApps(pApps ? JSON.parse(pApps) : []);
        };
        getAppData();
        window.electron.onCacheReload(getAppData);
    }, []);

    useEffect(() => {
        const getData = async () => {
            if (!query || !query.includes("!") || stage !== 2) return;
            const result = await getBangData(query);
            setBangData(result);
        };
        getData();
    }, [query, stage]);

    const pinApp = async (app: SearchQueryT) => {
        if (pinnedApps.length === 21) {
            showToast("Maximum Pins Reached", "You can pin up to 21 apps only.");
            return;
        }
        if (!pinnedApps.find((a) => isSameApp(a, app))) {
            const updated = [...pinnedApps, app];
            window.electronStore.set("pinnedApps", JSON.stringify(updated));
            setPinnedApps(updated);
        }
    };

    const unPinApp = async (app: SearchQueryT) => {
        const updated = pinnedApps.filter((a) => !isSameApp(a, app));
        window.electronStore.set("pinnedApps", JSON.stringify(updated));
        setPinnedApps(updated);
    };

    const faviconUrl = bangData?.d
        ? `https://www.google.com/s2/favicons?sz=24&domain_url=${encodeURIComponent(bangData.d)}`
        : null;

    const isSearchRoute = location.pathname === '/search';

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

    const context: MainLayoutContext = {
        apps,
        pinnedApps,
        setPinnedApps,
        pinApp,
        unPinApp,
        searchFilters,
        setSearchFilters,
    };

    return (
        <>
            <div style={styles.inputContainer}>
                {faviconUrl && stage === 2
                    ? <img src={faviconUrl} style={styles.favicon} />
                    : <Search size={20} className="text-white/30 shrink-0" />
                }
                <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                        selfQueryChangedRef.current = false;
                        setQuery(e.target.value);
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
                {isSearchRoute && query && (
                    <SearchQueryFilter filters={searchFilters} setFilters={setSearchFilters} />
                )}
            </div>
            <Outlet context={context} />
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
