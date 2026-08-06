import { useEffect, useRef, useState } from 'react';
import { Unlock, Lock, Loader2, RefreshCw } from "lucide-react";
import { GitHub } from "@/components/icons/github.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { Routes, Route, useNavigate, useLocation } from 'react-router';
import logo from "@/assets/icon.png";

import SettingsPage from "@/pages/settingsPage.tsx";
import AiPage from "@/pages/aiPage.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import MainLayout from "@/pages/mainPage.tsx";
import HomePage from "@/pages/homePage.tsx";
import AllAppsPage from "@/pages/allAppsPage.tsx";
import SearchPage from "@/pages/searchPage.tsx";
import { IntroModal } from "@/components/modal/introModal.tsx";
import { Walkthrough } from "@/components/walkthrough.tsx";
import { UpdateModal } from "@/components/modal/updateModal.tsx";
import { isEscapeCaptured } from "@/hooks/useEscape.ts";
import { getChangelogForVersion, getLatestChangelog, ChangelogEntry } from "@/data/changelog.ts";
import ErrorBoundary from "@/components/ErrorBoundary.tsx";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";


export default function App() {
    const [cacheLoadingStatus, setCacheLoadingStatus] = useState<boolean>(false);
    const [cacheProgress, setCacheProgress] = useState<{current:number; total:number}>({current:0, total:0});
    const [showIntroModal, setShowIntroModal] = useState(false);
    const [showWalkthrough, setShowWalkthrough] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updateModalVersion, setUpdateModalVersion] = useState("");
    const [updateModalChangelog, setUpdateModalChangelog] = useState<ChangelogEntry | null>(null);
    const [updateProgress, setUpdateProgress] = useState<number | null>(null);
    const [updateReady, setUpdateReady] = useState(false);

    const [query, setQuery] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
    const [argCommand, setArgCommand] = useState<SearchQueryT | null>(null);
    const [argInitialValues, setArgInitialValues] = useState<Record<string, string> | undefined>(undefined);
    const argCommandRef = useRef<SearchQueryT | null>(null);
    useEffect(() => { argCommandRef.current = argCommand; }, [argCommand]);

    const enterArgMode = (item: SearchQueryT, initial?: Record<string, string>) => {
        setArgInitialValues(initial);
        setArgCommand(item);
    };
    const exitArgMode = () => {
        setArgCommand(null);
        setArgInitialValues(undefined);
        // Clear the trailing query and route home so the remounted result
        // list has nothing under focus — prevents a stray Enter from
        // re-firing the Google fallback that the arg-bearing command name
        // would otherwise fall back to.
        setQuery("");
        navigate('/', { replace: true });
        setTimeout(() => inputRef.current?.focus(), 0);
    };
    const runArgCommand = (values: Record<string, string>) => {
        const item = argCommandRef.current;
        if (!item) return;
        // Same as running from the results list: dismiss now, let it work in the
        // background, and surface only a failure.
        exitArgMode();
        window.electron.hideWindow();
        window.apps.executeCommand(item, values)
            .then(result => {
                if (!result?.ok) {
                    window.electron.notify(`${item.name} failed`, result?.detail ?? "The command did not run.");
                }
            })
            .catch(err => window.electron.notify(`${item.name} failed`, err?.message ?? "The command did not run."));
    };

    const [showLockedIcon, setShowLockedIcon] = useState<boolean>(false);
    const [showUnlockedIcon, setShowUnlockedIcon] = useState<boolean>(false);
    const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unlockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    const locationRef = useRef<string>(location.pathname);
    useEffect(() => {
        locationRef.current = location.pathname;
    });

    useEffect(() => {
        const path = locationRef.current;
        if (path === '/settings' || path === '/ai') return;

        if (path === '/all') {
            navigate(`/all?query=${encodeURIComponent(query)}`, { replace: true });
        } else if (query.trim()) {
            navigate(`/search?query=${encodeURIComponent(query)}`, { replace: true });
        } else {
            navigate('/', { replace: true });
        }
    }, [query]);

    window.onerror = function (msg, url, line, col, error) {
        console.error("GLOBAL ERROR CAUGHT:");
        console.error(msg, url, line, col, error);
    };

    useEffect(() => {
        const checkIntroModal = async ()=>{
            const check = await window.electronStore.get("showIntroModal")
            window.electron.log("intro "+check);
            if (check==="" || check === null) setShowIntroModal(true);
            else setShowIntroModal(check==="true")
        }

        checkIntroModal();

        const checkUpdateModal = async () => {
            const info = await window.electron.getUpdateModalInfo();
            if (info.show && info.currentVersion) {
                const entry = getChangelogForVersion(info.currentVersion) ?? getLatestChangelog() ?? null;
                setUpdateModalChangelog(entry);
                setUpdateModalVersion(info.currentVersion);
                setShowUpdateModal(true);
            }
        };
        checkUpdateModal();

        const handleBlur = () => {
            if (inputRef.current) {
                setQuery("");
                inputRef.current.focus();
            }
            navigate('/');
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (isEscapeCaptured()) return;
                if (locationRef.current === '/') {
                    window.electron.hideWindow();
                } else {
                    inputRef.current?.focus();
                    setQuery("");
                    navigate('/', { replace: true });
                }
            }
            // Tab switches into the AI view, carrying whatever has been typed.
            if (e.key === "Tab" && !argCommandRef.current) {
                e.preventDefault();
                const typed = inputRef.current?.value?.trim() ?? "";
                if (locationRef.current === '/ai') {
                    navigate('/', { replace: true });
                } else {
                    navigate(typed ? `/ai?prompt=${encodeURIComponent(typed)}` : '/ai');
                    setQuery("");
                }
                setTimeout(() => inputRef.current?.focus(), 0);
            }
            // Ctrl+N opens the AI view. Once there, the view handles it itself
            // so the shortcut starts a fresh conversation rather than doing
            // nothing on a route it is already on.
            if (e.ctrlKey && e.key.toLowerCase() === "n" && locationRef.current !== '/ai') {
                e.preventDefault();
                setQuery("");
                navigate('/ai');
            }
            if (e.ctrlKey && e.key.toLowerCase() === "h") {
                e.preventDefault();
                if (locationRef.current === '/settings') {
                    navigate('/');
                } else {
                    navigate('/settings');
                }
            }

        };

        const handleCacheLoadedEvent = () => {
            setCacheLoadingStatus(false);
        };

        const getCacheLoadingStatus = async () => {
            let cacheAlreadyLoaded = false;

            // Register listeners BEFORE the status check to avoid a race where
            // cache-loaded fires during the IPC round-trip and is never caught.
            window.electron.onCacheLoaded(() => {
                cacheAlreadyLoaded = true;
                handleCacheLoadedEvent();
            });
            window.electron.setCacheLoadingBar((current, total) => {
                setCacheProgress({current, total});
            });

            const status = await window.electron.getCacheLoadingStatus();
            if (!cacheAlreadyLoaded) {
                setCacheLoadingStatus(status.loading);
                setCacheProgress({current: status.current, total: status.total});
            }
        };

        const handleShortcutModalOpen = () => {
            window.removeEventListener("keydown", handleKeyDown);
        };

        const handleShortcutModalClose = () => {
            window.addEventListener("keydown", handleKeyDown);
        };

        const handleRefocusInput = () => {
            setTimeout(() => inputRef.current?.focus(), 0);
        };

        const handleWindowLock = () => {
            if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
            setShowLockedIcon(true);
            setShowUnlockedIcon(false);
            lockTimeoutRef.current = setTimeout(() => {
                setShowLockedIcon(false);
                lockTimeoutRef.current = null;
            }, 1000);
        };

        const handleWindowUnlock = () => {
            if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
            setShowUnlockedIcon(true);
            setShowLockedIcon(false);
            unlockTimeoutRef.current = setTimeout(() => {
                setShowUnlockedIcon(false);
                unlockTimeoutRef.current = null;
            }, 1000);
        };

        window.electron.onUpdateProgress((data: { percent: number }) => {
            setUpdateProgress(Math.round(data.percent));
        });
        window.electron.onUpdateDownloaded(() => {
            setUpdateReady(true);
            setUpdateProgress(null);
        });

        window.electron.onWindowBlurred(handleBlur);
        window.electron.onWindowLocked(handleWindowLock);
        window.electron.onWindowUnlocked(handleWindowUnlock);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("shortcutModalOpen", handleShortcutModalOpen);
        window.addEventListener("shortcutModalClose", handleShortcutModalClose);
        window.addEventListener("refocusInput", handleRefocusInput);

        getCacheLoadingStatus();

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("shortcutModalOpen", handleShortcutModalOpen);
            window.removeEventListener("shortcutModalClose", handleShortcutModalClose);
            window.removeEventListener("refocusInput", handleRefocusInput);
        };
    }, []);

    if (cacheLoadingStatus) {
        const hasProgress = cacheProgress.total > 0;
        const pct = hasProgress
            ? Math.min(100, Math.round((cacheProgress.current / cacheProgress.total) * 100))
            : 0;
        return (
            <div className="w-screen h-screen bg-surface dark:bg-surface/[0.99] flex items-center justify-center rounded-xl" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex flex-col items-center gap-5">
                    <div className="relative flex items-center justify-center w-16 h-16">
                        <div className="absolute inset-0 rounded-full border border-line-070" />
                        <div className="absolute inset-0 rounded-full border-t border-ink/30 animate-spin" style={{ animationDuration: '1.4s' }} />
                        <img src={logo} alt="Volt" className="w-8 h-8 object-contain opacity-60" />
                    </div>
                    <div className="flex flex-col items-center gap-2.5">
                        <span className="text-[10px] tracking-[0.25em] uppercase text-tone-200">
                            {hasProgress ? `Loading ${pct}%` : 'Loading'}
                        </span>
                        <div className="w-32 h-0.5 rounded-full bg-fill-060 overflow-hidden">
                            {hasProgress ? (
                                <div
                                    className="h-full bg-ink/30 rounded-full transition-[width] duration-200 ease-out"
                                    style={{ width: `${pct}%` }}
                                />
                            ) : (
                                <div className="h-full bg-ink/20 rounded-full animate-pulse" style={{ width: '40%', animationDuration: '1.4s' }} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen overflow-hidden bg-surface dark:bg-surface/[0.99] flex flex-col rounded-xl">
            <div className="h-1 w-full shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
            <Toaster />
            <IntroModal
                open={showIntroModal}
                setOpen={setShowIntroModal}
                onStartTour={() => {
                    navigate('/');
                    setShowWalkthrough(true);
                }}
            />
            <Walkthrough open={showWalkthrough} onClose={() => setShowWalkthrough(false)} />
            <UpdateModal
                open={showUpdateModal && !showIntroModal}
                onClose={() => setShowUpdateModal(false)}
                changelog={updateModalChangelog}
                version={updateModalVersion}
            />
            {(showUnlockedIcon || showLockedIcon) &&
                <div className="absolute top-3 right-3 flex items-center gap-2 z-50 bg-surface/[0.92] px-3 py-2 rounded-lg backdrop-blur-[10px] border border-line-080 shadow-[0_4px_15px_var(--shadow-1)] animate-in fade-in slide-in-from-top-2 duration-200">
                    {showLockedIcon && <><Lock size={14} className="text-tone-600" /><span className="text-[11px] text-tone-500">Locked</span></>}
                    {showUnlockedIcon && <><Unlock size={14} className="text-tone-600" /><span className="text-[11px] text-tone-500">Unlocked</span></>}
                </div>
            }

            <div className="grow min-h-0 flex flex-col">
                <ErrorBoundary>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <MainLayout
                                inputRef={inputRef}
                                query={query}
                                setQuery={setQuery}
                                argCommand={argCommand}
                                argInitialValues={argInitialValues}
                                enterArgMode={enterArgMode}
                                exitArgMode={exitArgMode}
                                runArgCommand={runArgCommand}
                            />
                        }
                    >
                        <Route index element={<HomePage />} />
                        <Route path="all" element={<AllAppsPage />} />
                        <Route path="search" element={<SearchPage />} />
                        <Route path="ai" element={<AiPage />} />
                    </Route>
                    <Route path="/settings" element={<SettingsPage />} />
                </Routes>
                </ErrorBoundary>
            </div>

            <div className="border-t border-line-070 h-10 shrink-0 flex items-center justify-between px-4 w-[800px]">
                <button
                    aria-label="GitHub"
                    // The mark carries its own colour now, so a text-colour
                    // hover has nothing to act on — fade it instead.
                    className="opacity-40 hover:opacity-100 transition-opacity duration-150 cursor-pointer"
                    onClick={async () => {
                        window.electron.openExternal("https://github.com/NotHamxa");
                    }}
                >
                    <GitHub width={18} height={18} />
                </button>
                <div className="flex items-center gap-3">
                    <TooltipProvider delayDuration={100}>
                        {updateReady ? (
                            <button
                                onClick={() => window.electron.quitAndInstall()}
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/20 transition-colors duration-150"
                            >
                                <RefreshCw size={11} />
                                Restart to update
                            </button>
                        ) : updateProgress !== null ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="flex items-center text-tone-250 cursor-default">
                                        <Loader2 size={13} className="animate-spin" />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-surface/[0.98] border border-line-100 text-tone-700 text-[11px]">
                                    Downloading update… {updateProgress}%
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                    </TooltipProvider>

                    <div data-walkthrough="settings-btn" className="flex items-center space-x-2 text-tone-250 text-sm">
                        <button
                            onClick={() => {
                                if (locationRef.current === '/settings') {
                                    navigate('/');
                                } else {
                                    navigate('/settings');
                                }
                            }}
                            className="hover:text-tone-550 transition-colors duration-150 cursor-pointer"
                        >
                            Settings
                        </button>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-fill-070 border border-line-100">Ctrl</span>
                        <span className="text-tone-150">+</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-fill-070 border border-line-100">H</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
