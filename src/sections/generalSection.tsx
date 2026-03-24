import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Check, X, Keyboard, AlertTriangle, History, Power } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SettingCard, DeleteHistorySection, ResetAppData } from "@/components/settingsCard.tsx";

interface GeneralSettingsSectionProps {
    setHasUnsaved: (val: boolean) => void;
}

export default function GeneralSettingsSection({ setHasUnsaved }: GeneralSettingsSectionProps) {
    const [listeningToKeyboard, setListeningToKeyboard] = useState(false);
    const [openBind, setOpenBind] = useState("");
    const [bindLoad, setBindLoad] = useState(false);
    const [currentOpenBind, setCurrentOpenBind] = useState("");
    const pressedKeysRef = useRef<Set<string>>(new Set());

    const [openOnStartup, setOpenOnStartup] = useState(false);
    const [startupSaved, setStartupSaved] = useState(false);

    useEffect(() => {
        (async () => {
            const bind = await window.electronStore.get("openWindowBind");
            setCurrentOpenBind(bind || "Not Set");
            const startup = await window.electron.getOpenOnStartup();
            setOpenOnStartup(startup ?? false);
        })();
    }, []);

    // Notify parent about unsaved state when recording shortcut
    useEffect(() => {
        setHasUnsaved(listeningToKeyboard);
    }, [listeningToKeyboard]);

    const formatKey = (code: string, key: string): string => {
        const keyMap: Record<string, string> = {
            ControlLeft: "Ctrl", ControlRight: "Ctrl", ShiftLeft: "Shift", ShiftRight: "Shift",
            AltLeft: "Alt", AltRight: "Alt", MetaLeft: "Super", MetaRight: "Super",
            Space: "Space", Escape: "Esc", ArrowUp: "Up", ArrowDown: "Down",
        };
        return keyMap[code] || key.toUpperCase();
    };

    const keyDownHandler = (e: KeyboardEvent) => {
        e.preventDefault();
        const formattedKey = formatKey(e.code, e.key);
        if (formattedKey === "+") return;
        pressedKeysRef.current.add(formattedKey);
        setOpenBind(Array.from(pressedKeysRef.current).slice(0, 3).join(" + "));
    };

    useEffect(() => {
        if (listeningToKeyboard) {
            window.addEventListener("keydown", keyDownHandler);
        } else {
            window.removeEventListener("keydown", keyDownHandler);
            pressedKeysRef.current.clear();
            setOpenBind("");
        }
        return () => window.removeEventListener("keydown", keyDownHandler);
    }, [listeningToKeyboard]);

    const confirmChangeBind = async () => {
        if (pressedKeysRef.current.size < 2) {
            window.electron.notify("Invalid Shortcut", "Please use at least two keys (e.g., Alt + Space)");
            return;
        }
        const formattedKeys = Array.from(pressedKeysRef.current).slice(0, 3).join("+");
        setBindLoad(true);
        await window.electron.setOpenBind(formattedKeys);
        setBindLoad(false);
        window.electron.notify("Shortcut Updated", `New shortcut: ${formattedKeys}`);
        setCurrentOpenBind(formattedKeys);
        setListeningToKeyboard(false);
    };

    const toggleOpenOnStartup = async (enabled: boolean) => {
        setOpenOnStartup(enabled);
        await window.electron.setOpenOnStartup(enabled);
        setStartupSaved(true);
        setTimeout(() => setStartupSaved(false), 1500);
    };

    return (
        <div className="space-y-10">
            <header>
                <h2 className="text-[22px] font-semibold text-white tracking-[-0.03em] mb-1.5">General</h2>
                <p className="text-white/40 text-[13px]">Configure how you interact with the application.</p>
            </header>

            <div className="space-y-4">
                <SettingCard
                    icon={Keyboard}
                    title="Activation Shortcut"
                    description="The global keyboard combination used to toggle the search bar."
                >
                    <div className="flex items-center gap-3">
                        {!listeningToKeyboard && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.09]">
                                {currentOpenBind.split("+").map((k, i) => (
                                    <span key={i} className="flex items-center gap-1.5">
                                        {i > 0 && <span className="text-white/20 text-[11px]">+</span>}
                                        <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.12] text-[11px] font-mono text-white/55 min-w-[24px] text-center">
                                            {k.trim()}
                                        </kbd>
                                    </span>
                                ))}
                            </div>
                        )}
                        {listeningToKeyboard ? (
                            <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
                                <span className="px-4 text-[13px] font-mono text-white/60 animate-pulse min-w-25 text-center">
                                    {openBind || "Recording..."}
                                </span>
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/10 text-white/40 hover:text-white/70" onClick={() => setListeningToKeyboard(false)}>
                                    <X size={14} />
                                </Button>
                                <Button size="icon" className="h-8 w-8 bg-white text-black hover:bg-white/90" onClick={confirmChangeBind}>
                                    {bindLoad ? <Spinner /> : <Check size={14} />}
                                </Button>
                            </div>
                        ) : (
                            <Button variant="outline" className="h-9 rounded-xl border-white/10 hover:bg-white/8 hover:border-white/15 px-4 text-white/60 hover:text-white/80 text-[13px]" onClick={() => setListeningToKeyboard(true)}>
                                Change
                            </Button>
                        )}
                    </div>
                </SettingCard>

                <SettingCard
                    icon={Power}
                    title="Open on Startup"
                    description="Automatically launch Volt when you sign in to your computer."
                >
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => toggleOpenOnStartup(!openOnStartup)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                                openOnStartup ? "bg-white border-white" : "bg-white/10 border-white/10"
                            }`}
                            role="switch"
                            aria-checked={openOnStartup}
                        >
                            <span
                                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow transition duration-200 ease-in-out mt-[1px] ${
                                    openOnStartup ? "translate-x-3.5 bg-black" : "translate-x-0.5 bg-white/40"
                                }`}
                            />
                        </button>
                        <div className={`transition-all duration-300 ${startupSaved ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
                            <Check size={14} className="text-green-400/70" />
                        </div>
                    </div>
                </SettingCard>

                <div className="pt-8 mt-4 border-t border-white/5">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-red-400/50 mb-6 flex items-center gap-2">
                        <AlertTriangle size={12} /> Danger Zone
                    </h3>
                    <div className="space-y-4">
                        <SettingCard
                            isDestructive
                            icon={History}
                            title="Clear History"
                            description="Delete all recent searches and usage statistics from your local device."
                        >
                            <DeleteHistorySection />
                        </SettingCard>

                        <SettingCard
                            isDestructive
                            icon={AlertTriangle}
                            title="Factory Reset"
                            description="Reset the application to its original state. This will remove all configurations."
                        >
                            <ResetAppData />
                        </SettingCard>
                    </div>
                </div>
            </div>
        </div>
    );
}
