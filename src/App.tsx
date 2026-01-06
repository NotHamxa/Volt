import { CSSProperties, useEffect, useRef, useState } from 'react';
import { Unlock, Lock } from "lucide-react";
import { FaGithub } from "react-icons/fa6";

import SettingsPage from "@/pages/settingsPage.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import MainPage from "@/pages/mainPage.tsx";


export default function App() {
    const [cacheLoadingStatus, setCacheLoadingStatus] = useState<boolean>(false);
    const [currentCacheStep, setCurrentCacheStep] = useState<number>(0);
    const [totalCacheSteps, setTotalCacheSteps] = useState<number>(0);

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
            <div style={styles.cacheLoading}>
                <Label style={styles.cacheLabel}>App data loading, please wait...</Label>
                <Progress
                    value={Math.trunc((currentCacheStep / totalCacheSteps) * 100)}
                    style={{ width: "60%" }}
                />
            </div>
        );
    }

    return (
        <div className="w-screen h-screen overflow-hidden bg-[rgba(24,24,27,0.99)] flex flex-col rounded-xl">
            <Toaster />
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
                    onClick={async () => {
                        window.electron.openExternal("https://github.com/NotHamxa")
                    }}
                >
                    <FaGithub size={20} />
                </button>
                <div className="flex items-center space-x-2 text-gray-400 text-sm">
                    <button
                        onClick={() => {
                            setPrevPage(currentPage);
                            if (currentPage === "main") setCurrentPage("settings");
                            else setCurrentPage(prevPage);
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