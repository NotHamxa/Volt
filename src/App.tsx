import { useEffect, useRef, useState } from 'react';
import { Unlock, Lock } from "lucide-react";
import { FaGithub } from "react-icons/fa6";
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

import SettingsPage from "@/pages/settingsPage.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import MainLayout from "@/pages/mainPage.tsx";
import HomePage from "@/pages/homePage.tsx";
import AllAppsPage from "@/pages/allAppsPage.tsx";
import SearchPage from "@/pages/searchPage.tsx";
import WebPage from "@/pages/webPage.tsx";
import { IntroModal } from "@/components/modal/introModal.tsx";


export default function App() {
    const [cacheLoadingStatus, setCacheLoadingStatus] = useState<boolean>(false);
    const [currentCacheStep, setCurrentCacheStep] = useState<number>(0);
    const [totalCacheSteps, setTotalCacheSteps] = useState<number>(0);
    const [showIntroModal, setShowIntroModal] = useState(false);

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
            const status = await window.electron.getCacheLoadingStatus();
            if (status) {
                window.electron.onCacheLoaded(handleCacheLoadedEvent);
                window.electron.setCacheLoadingBar((currentStep, totalSteps) => {
                    setCurrentCacheStep(currentStep);
                    setTotalCacheSteps(totalSteps);
                });
            }
            setCacheLoadingStatus(status);
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
            <div className="w-screen h-screen bg-[rgba(24,24,27,0.99)] flex flex-col items-center justify-center gap-4 rounded-xl">
                <Label className="text-lg text-white font-medium">
                    App data loading, please wait...
                </Label>
                <Progress
                    value={Math.trunc((currentCacheStep / totalCacheSteps) * 100)}
                    className="w-3/5"
                />
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
    );
}
