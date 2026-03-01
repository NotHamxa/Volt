import { useEffect, useRef, useState } from 'react';
import { Unlock, Lock, Loader2, RefreshCw } from "lucide-react";
import { FaGithub } from "react-icons/fa6";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import logo from "@/assets/icon.png";

import SettingsPage from "@/pages/settingsPage.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import MainLayout from "@/pages/mainPage.tsx";
import HomePage from "@/pages/homePage.tsx";
import AllAppsPage from "@/pages/allAppsPage.tsx";
import SearchPage from "@/pages/searchPage.tsx";
import WebPage from "@/pages/webPage.tsx";
import { IntroModal } from "@/components/modal/introModal.tsx";


export default function App() {
    const [cacheLoadingStatus, setCacheLoadingStatus] = useState<boolean>(false);
    const [showIntroModal, setShowIntroModal] = useState(false);
    const [updateProgress, setUpdateProgress] = useState<number | null>(null);
    const [updateReady, setUpdateReady] = useState(false);

    const [query, setQuery] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
    const [stage, setStage] = useState<number>(1);
    const [escApp,setEscApp] = useState<boolean>(true);
    const selfQueryChangedRef = useRef<boolean>(false);

    const [showLockedIcon, setShowLockedIcon] = useState<boolean>(false);
    const [showUnlockedIcon, setShowUnlockedIcon] = useState<boolean>(false);
    const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unlockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const escAppRef = useRef(escApp);

    const navigate = useNavigate();
    const location = useLocation();

    const locationRef = useRef<string>(location.pathname);
    useEffect(() => {
        locationRef.current = location.pathname;
    });

    useEffect(() => {
        window.electron.toggleEscape(location.pathname !== "/");
        setEscApp(location.pathname === "/");
        escAppRef.current = location.pathname === "/";

    }, [location.pathname]);

    useEffect(()=>{
        window.electron.log(escApp)
    },[escApp]);
    function setQueryFromBang(value: string) {
        selfQueryChangedRef.current = true;
        setQuery(value);
    }

    useEffect(() => {
        const path = locationRef.current;
        if (path === '/settings') return;

        if (stage === 2) {
            navigate(`/web?query=${encodeURIComponent(query)}`, { replace: true });
        } else if (path === '/all') {
            navigate(`/all?query=${encodeURIComponent(query)}`, { replace: true });
        } else if (query.trim()) {
            navigate(`/search?query=${encodeURIComponent(query)}`, { replace: true });
        } else {
            navigate('/', { replace: true });
        }
    }, [query, stage]);

    useEffect(() => {
        if (stage === 1) selfQueryChangedRef.current = false;
    }, [stage]);

    window.onerror = function (msg, url, line, col, error) {
        console.error("GLOBAL ERROR CAUGHT:");
        console.error(msg, url, line, col, error);
    };

    useEffect(() => {
        document.documentElement.classList.add("dark");

        const checkIntroModal = async ()=>{
            const check = await window.electronStore.get("showIntroModal")
            window.electron.log("intro "+check);
            if (check==="" || check === null) setShowIntroModal(true);
            else setShowIntroModal(check==="true")
        }

        checkIntroModal();

        const handleBlur = () => {
            if (inputRef.current) {
                setQuery("");
                setStage(1);
                inputRef.current.focus();
            }
            navigate('/');
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !escAppRef.current){
                inputRef.current?.focus();
                setQuery("");
                navigate('/', { replace: true });
            }
            if (e.key === "Tab") {
                e.preventDefault();
                setStage(prev => (prev === 1 ? 2 : 1));
                inputRef.current?.focus();
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
            window.electron.setCacheLoadingBar(() => {});

            const status = await window.electron.getCacheLoadingStatus();
            if (!cacheAlreadyLoaded) {
                setCacheLoadingStatus(status);
            }
        };

        const handleShortcutModalOpen = () => {
            window.removeEventListener("keydown", handleKeyDown);
        };

        const handleShortcutModalClose = () => {
            window.addEventListener("keydown", handleKeyDown);
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

        getCacheLoadingStatus();

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("shortcutModalOpen", handleShortcutModalOpen);
            window.removeEventListener("shortcutModalClose", handleShortcutModalClose);
        };
    }, []);

    if (cacheLoadingStatus) {
        return (
            <div className="w-screen h-screen bg-[rgba(24,24,27,0.99)] flex items-center justify-center rounded-xl">
                <div className="flex flex-col items-center gap-5">
                    <div className="relative flex items-center justify-center w-16 h-16">
                        <div className="absolute inset-0 rounded-full border border-white/[0.07]" />
                        <div className="absolute inset-0 rounded-full border-t border-white/30 animate-spin" style={{ animationDuration: '1.4s' }} />
                        <img src={logo} alt="Volt" className="w-8 h-8 object-contain opacity-60" />
                    </div>
                    <span className="text-[10px] tracking-[0.25em] uppercase text-white/20">Loading</span>
                </div>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen overflow-hidden bg-[rgba(24,24,27,0.99)] flex flex-col rounded-xl">
            <Toaster />
            <IntroModal open={showIntroModal} setOpen={setShowIntroModal} />
            {(showUnlockedIcon || showLockedIcon) &&
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-5 items-center justify-center z-50 bg-[rgba(24,24,27,0.95)] px-10 py-5 rounded-xl backdrop-blur-[10px] shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
                    {showLockedIcon && <Lock size={48} className="text-white" />}
                    {showUnlockedIcon && <Unlock size={48} className="text-white" />}
                </div>
            }

            <div className="grow flex flex-col">
                <Routes>
                    <Route
                        path="/"
                        element={
                            <MainLayout
                                inputRef={inputRef}
                                stage={stage}
                                query={query}
                                setQuery={setQuery}
                                selfQueryChangedRef={selfQueryChangedRef}
                            />
                        }
                    >
                        <Route index element={<HomePage />} />
                        <Route path="all" element={<AllAppsPage />} />
                        <Route path="search" element={<SearchPage />} />
                        <Route
                            path="web"
                            element={
                                <WebPage
                                    selfQueryChangedRef={selfQueryChangedRef}
                                    setQueryFromBang={setQueryFromBang}
                                />
                            }
                        />
                    </Route>
                    <Route path="/settings" element={<SettingsPage />} />
                </Routes>
            </div>

            <div className="border-t border-white/[0.07] h-10 flex items-center justify-between px-4 w-[800px]">
                <button
                    className="text-white/25 hover:text-white/60 transition-colors duration-150"
                    onClick={async () => {
                        window.electron.openExternal("https://github.com/NotHamxa");
                    }}
                >
                    <FaGithub size={18} />
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
                                    <span className="flex items-center text-white/25 cursor-default">
                                        <Loader2 size={13} className="animate-spin" />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-[rgba(24,24,27,0.98)] border border-white/10 text-white/70 text-[11px]">
                                    Downloading update… {updateProgress}%
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                    </TooltipProvider>

                    <div className="flex items-center space-x-2 text-white/25 text-sm">
                        <button
                            onClick={() => {
                                if (locationRef.current === '/settings') {
                                    navigate('/');
                                } else {
                                    navigate('/settings');
                                }
                            }}
                            className="hover:text-white/55 transition-colors duration-150 cursor-pointer"
                        >
                            Settings
                        </button>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-white/[0.07] border border-white/10">Ctrl</span>
                        <span className="text-white/15">+</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-white/[0.07] border border-white/10">H</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
