import { useEffect, useRef, useState } from 'react';
import { Unlock, Lock } from "lucide-react";
import { FaGithub } from "react-icons/fa6";

import SettingsPage from "@/pages/settingsPage.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import MainPage from "@/pages/mainPage.tsx";
import {IntroModal} from "@/components/modal/introModal.tsx";


export default function App() {
    const [cacheLoadingStatus, setCacheLoadingStatus] = useState<boolean>(false);
    const [currentCacheStep, setCurrentCacheStep] = useState<number>(0);
    const [totalCacheSteps, setTotalCacheSteps] = useState<number>(0);

    const [showIntroModal, setShowIntroModal] = useState(true);


    const [query, setQuery] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
    const [stage, setStage] = useState<number>(1);
    const [currentPage, setCurrentPage] = useState<"main" | "settings">("main");
    const [prevPage, setPrevPage] = useState<"main" | "settings">("main");

    const currentPageRef = useRef(currentPage);
    const prevPageRef = useRef(prevPage);

    const [showLockedIcon, setShowLockedIcon] = useState<boolean>(false);
    const [showUnlockedIcon, setShowUnlockedIcon] = useState<boolean>(false);
    const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unlockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    window.onerror = function (msg, url, line, col, error) {
        console.error("GLOBAL ERROR CAUGHT:");
        console.error(msg, url, line, col, error);
    };
    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        prevPageRef.current = prevPage;
    }, [prevPage]);

    useEffect(() => {
        document.documentElement.classList.add("dark");

        const handleBlur = () => {
            if (inputRef.current){
                setQuery("");
                setStage(1)
                inputRef.current.focus();
            }
            if (currentPageRef.current === "settings") {
                setCurrentPage("main");
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Tab") {
                e.preventDefault();
                setStage(prev => (prev === 1 ? 2 : 1));
                inputRef.current?.focus()
            }

            if (e.ctrlKey && e.key.toLowerCase() === "h") {
                e.preventDefault();
                const current = currentPageRef.current;
                const previous = prevPageRef.current;
                if (current === "main") {
                    setPrevPage(current);
                    setCurrentPage("settings");
                } else {
                    setCurrentPage(previous);
                }
            }
        };

        const handleCacheLoadedEvent = () => {
            setCacheLoadingStatus(false);
        }

        const getCacheLoadingStatus = async () => {
            const status = await window.electron.getCacheLoadingStatus()
            if (status) {
                window.electron.onCacheLoaded(handleCacheLoadedEvent)
                window.electron.setCacheLoadingBar((currentStep, totalSteps) => {
                    setCurrentCacheStep(currentStep)
                    setTotalCacheSteps(totalSteps)
                })
            }
            setCacheLoadingStatus(status);
        }

        const handleShortcutModalOpen = () => {
            window.removeEventListener("keydown", handleKeyDown);
        }

        const handleShortcutModalClose = () => {
            window.addEventListener("keydown", handleKeyDown);
        }

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
        window.electron.onWindowLocked(handleWindowLock)
        window.electron.onWindowUnlocked(handleWindowUnlock)

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("shortcutModalOpen", handleShortcutModalOpen)
        window.addEventListener("shortcutModalClose", handleShortcutModalClose)

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
            <IntroModal open={showIntroModal} setOpen={setShowIntroModal}/>
            {(showUnlockedIcon || showLockedIcon) &&
                <div
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        display: "flex",
                        gap: "20px",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 50,
                        backgroundColor: "rgba(24, 24, 27, 0.95)",
                        padding: "20px 40px",
                        borderRadius: "12px",
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)",
                    }}
                >
                    {showLockedIcon && <Lock size={48} className="text-white" />}
                    {showUnlockedIcon && <Unlock size={48} className="text-white" />}
                </div>
            }

            <div className="grow flex flex-col">
                {currentPage === "main" &&
                    <MainPage
                        inputRef={inputRef}
                        stage={stage}
                        query={query}
                        setQuery={setQuery}
                    />
                }
                {currentPage === "settings" && <SettingsPage />}
            </div>
            <div
                style={{
                    borderTopStyle: "solid",
                    borderTopColor: "rgba(255,255,255,0.07)",
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
                    className="text-white/25 hover:text-white/60 transition-colors duration-150"
                    onClick={async () => {
                        window.electron.openExternal("https://github.com/NotHamxa")
                    }}
                >
                    <FaGithub size={18} />
                </button>
                <div className="flex items-center space-x-2 text-white/25 text-sm">
                    <button
                        onClick={() => {
                            setPrevPage(currentPage);
                            if (currentPage === "main") setCurrentPage("settings");
                            else setCurrentPage(prevPage);
                        }}
                        className="hover:text-white/55 transition-colors duration-150 cursor-pointer"
                    >
                        Settings
                    </button>
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>Ctrl</span>
                    <span className="text-white/15">+</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>H</span>
                </div>
            </div>
        </div>
    );
}