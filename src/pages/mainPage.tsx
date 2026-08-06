import { useCallback, useEffect, useState } from 'react';
import { Search } from "lucide-react";
import { Outlet, useLocation } from 'react-router';
import { Input } from "@/components/ui/input.tsx";
import SearchQueryFilter from "@/components/searchQueryFilter.tsx";
import { getBangData } from "@/scripts/bangs.ts";
import { BangData } from "@/interfaces/bang.ts";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import { isSameApp } from "@/utils/appUtils.ts";
import ArgEntryBar from "@/components/argEntryBar.tsx";
import { useInlineCompletion } from "@/hooks/useInlineCompletion.ts";

export type MainLayoutContext = {
    apps: SearchQueryT[];
    pinnedApps: SearchQueryT[];
    logoMap: Map<string, string>;
    setPinnedApps: React.Dispatch<React.SetStateAction<SearchQueryT[]>>;
    pinApp: (app: SearchQueryT) => void;
    unPinApp: (app: SearchQueryT) => void;
    searchFilters: boolean[];
    setSearchFilters: React.Dispatch<React.SetStateAction<boolean[]>>;
    enterArgMode: (item: SearchQueryT, initial?: Record<string, string>) => void;
    clearQuery: () => void;
    query: string;
};

interface MainLayoutProps {
    inputRef: React.RefObject<HTMLInputElement | null>;
    query: string;
    setQuery: React.Dispatch<React.SetStateAction<string>>;
    argCommand: SearchQueryT | null;
    argInitialValues?: Record<string, string>;
    enterArgMode: (item: SearchQueryT, initial?: Record<string, string>) => void;
    exitArgMode: () => void;
    runArgCommand: (values: Record<string, string>) => void;
}

export default function MainLayout({ inputRef, query, setQuery, argCommand, argInitialValues, enterArgMode, exitArgMode, runArgCommand }: MainLayoutProps) {
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [searchFilters, setSearchFilters] = useState<boolean[]>([true, true, true, true, true]);
    const [apps, setApps] = useState<SearchQueryT[]>([]);
    const [pinnedApps, setPinnedApps] = useState<SearchQueryT[]>([]);
    const [logoMap, setLogoMap] = useState<Map<string, string>>(new Map());
    const location = useLocation();

    const { completion, suffix } = useInlineCompletion(query, apps);

    // Programmatic reset of the search box (e.g. after pinning from results).
    const clearQuery = useCallback(() => setQuery(""), [setQuery]);

    useEffect(() => {
        const getAppData = async () => {
            const appsData: SearchQueryT[] = await window.apps.searchApps("");
            setApps(appsData);
            const pApps = await window.electronStore.get("pinnedApps");
            setPinnedApps(pApps ? JSON.parse(pApps) : []);

            const entries = await Promise.all(
                appsData.map(async (item) => {
                    let logo: string | undefined;
                    if (item.source === "Steam" && item.appId) {
                        logo = await window.apps.getSteamGameLogo(item.appId) ?? undefined;
                    } else if (item.source === "UWP") {
                        logo = await window.apps.getUwpAppLogo(item);
                    } else {
                        // Covers AppsFolder entries with no path too: getAppLogo
                        // checks the icon cache first, which the shell pass fills.
                        logo = await window.apps.getAppLogo(item);
                    }
                    return [`${item.path ?? ""}|${item.appId ?? ""}`, logo] as const;
                })
            );
            const map = new Map<string, string>();
            for (const [key, logo] of entries) {
                if (logo) map.set(key, logo);
            }
            setLogoMap(map);
        };
        const reloadPinnedApps = async () => {
            const pApps = await window.electronStore.get("pinnedApps");
            setPinnedApps(pApps ? JSON.parse(pApps) : []);
        };
        getAppData();
        window.electron.onCacheReload(getAppData);
        window.addEventListener("pinnedAppsChanged", reloadPinnedApps);
        return () => window.removeEventListener("pinnedAppsChanged", reloadPinnedApps);
    }, []);

    // Drives the favicon chip on the input whenever a bang is typed.
    useEffect(() => {
        const getData = async () => {
            setBangData(query.includes("!") ? await getBangData(query) : null);
        };
        getData();
    }, [query]);

    const pinApp = async (app: SearchQueryT) => {
        if (pinnedApps.length === 21) {
            window.electron.notify("Maximum Pins Reached", "You can pin up to 21 apps only.");
            return;
        }
        if (!pinnedApps.find((a) => isSameApp(a, app))) {
            const updated = [...pinnedApps, app];
            window.electronStore.set("pinnedApps", JSON.stringify(updated));
            setPinnedApps(updated);
            window.dispatchEvent(new CustomEvent("pinnedAppsChanged"));
        }
    };

    const unPinApp = async (app: SearchQueryT) => {
        const updated = pinnedApps.filter((a) => !isSameApp(a, app));
        window.electronStore.set("pinnedApps", JSON.stringify(updated));
        setPinnedApps(updated);
        window.dispatchEvent(new CustomEvent("pinnedAppsChanged"));
    };

    const faviconUrl = bangData?.d
        ? `https://www.google.com/s2/favicons?sz=24&domain_url=${encodeURIComponent(bangData.d)}`
        : null;

    const isSearchRoute = location.pathname === '/search';
    const isAiRoute = location.pathname === '/ai';

    const context: MainLayoutContext = {
        apps,
        pinnedApps,
        logoMap,
        setPinnedApps,
        pinApp,
        unPinApp,
        searchFilters,
        setSearchFilters,
        enterArgMode,
        clearQuery,
        query,
    };

    return (
        <>
            {isAiRoute ? null : argCommand ? (
                <ArgEntryBar
                    command={argCommand}
                    initialValues={argInitialValues}
                    onRun={runArgCommand}
                    onCancel={exitArgMode}
                />
            ) : (
                <div data-walkthrough="search-input" className="flex flex-row gap-2.5 items-center px-5 border-b border-line-070 mb-[5px]">
                    {faviconUrl
                        ? <img src={faviconUrl} className="w-6 h-6" />
                        : <Search size={20} className="text-ink/30 shrink-0" />
                    }
                    <div className="relative w-full">
                    {/* Ghost text sits behind the input, showing only the part
                        that would be added. The typed portion is rendered
                        invisibly so the suffix lines up with the real caret. */}
                    {suffix && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 my-2.5 flex h-9 items-center px-3 text-base md:text-sm"
                        >
                            <span className="invisible whitespace-pre">{query}</span>
                            <span className="text-ink/25 whitespace-pre">{suffix}</span>
                        </div>
                    )}
                    <Input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                            }
                            // Accept the ghost only when the caret is already at
                            // the end, so ArrowRight still moves normally.
                            if (e.key === 'ArrowRight' && completion) {
                                const el = e.currentTarget;
                                const atEnd = el.selectionStart === query.length &&
                                              el.selectionEnd === query.length;
                                if (atEnd) {
                                    e.preventDefault();
                                    setQuery(completion);
                                }
                            }
                        }}
                        onBlur={() => {
                            setTimeout(() => {
                                const active = document.activeElement as HTMLElement | null;
                                if (
                                    active &&
                                    (active.tagName === 'INPUT' ||
                                     active.tagName === 'TEXTAREA' ||
                                     active.closest('[role="dialog"]'))
                                ) return;
                                inputRef.current?.focus();
                            }, 0);
                        }}
                        placeholder="Search apps, files and the web"
                        // shadow-none: the Input primitive ships a shadow-sm, which
                        // drew a faint rounded outline around the search field.
                        // It was nearly invisible on the dark panel and obvious on
                        // the light one — and this is chrome, not a form field.
                        className="w-full my-2.5 block border-0 shadow-none bg-transparent relative"
                        autoFocus
                    />
                    </div>
                    {isSearchRoute && query && (
                        <SearchQueryFilter filters={searchFilters} setFilters={setSearchFilters} />
                    )}
                </div>
            )}
            {/* Only the search chrome above is hidden on the AI route — the
                Outlet must still render, since /ai is a child route. */}
            {argCommand && !isAiRoute ? (
                <div className="flex-1 min-h-0 flex items-center justify-center px-8">
                    <p className="text-[11px] text-ink/30 text-center leading-relaxed">
                        Filling arguments for <span className="text-ink/55 font-medium">{argCommand.name}</span>.<br />
                        Tab to move between fields. Enter to run. Esc to cancel.
                    </p>
                </div>
            ) : (
                <Outlet context={context} />
            )}
        </>
    );
}
