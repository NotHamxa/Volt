import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Check, X, Keyboard, AlertTriangle, History, Power, Palette, Monitor, Sun, Moon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SettingCard, DeleteHistorySection, ResetAppData } from "@/components/settingsCard.tsx";
import { SectionLead, GroupLabel, Toggle } from "@/components/settingsLayout.tsx";
import { useTheme, ThemeChoice } from "@/theme.tsx";

const THEME_OPTIONS: Array<{ id: ThemeChoice; label: string; icon: typeof Monitor }> = [
    { id: "system", label: "System", icon: Monitor },
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
];

function ThemePicker() {
    const { choice, setChoice } = useTheme();
    return (
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-fill-040 border border-line-070">
            {THEME_OPTIONS.map(({ id, label, icon: Icon }) => {
                const active = choice === id;
                return (
                    <button
                        key={id}
                        onClick={() => setChoice(id)}
                        aria-pressed={active}
                        className={`flex items-center gap-1.5 px-2.5 h-6 rounded-md text-[11px] font-medium transition-colors duration-150 cursor-pointer ${
                            active
                                ? "bg-fill-100 text-tone-850"
                                : "text-tone-400 hover:text-tone-700 hover:bg-fill-040"
                        }`}
                    >
                        <Icon size={11} />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

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
        <div className="space-y-7">
            <SectionLead>Configure how you interact with the application.</SectionLead>

            <div className="space-y-2">
                <GroupLabel>Appearance</GroupLabel>
                <SettingCard
                    anchor="appearance"
                    icon={Palette}
                    title="Theme"
                    description="Match your system, or pin Volt to light or dark."
                >
                    <ThemePicker />
                </SettingCard>

                <div className="pt-5" />
                <GroupLabel>Behaviour</GroupLabel>
                <SettingCard
                    anchor="activation-shortcut"
                    icon={Keyboard}
                    title="Activation Shortcut"
                    description="The global keyboard combination used to toggle the search bar."
                >
                    <div className="flex items-center gap-2">
                        {!listeningToKeyboard && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-fill-040 border border-line-070">
                                {currentOpenBind.split("+").map((k, i) => (
                                    <span key={i} className="flex items-center gap-1">
                                        {i > 0 && <span className="text-tone-200 text-[10px]">+</span>}
                                        <kbd className="px-1.5 py-0.5 rounded bg-fill-060 border border-line-100 text-[10px] font-mono text-tone-550 min-w-[22px] text-center">
                                            {k.trim()}
                                        </kbd>
                                    </span>
                                ))}
                            </div>
                        )}
                        {listeningToKeyboard ? (
                            <div className="flex items-center gap-1 p-0.5 rounded-md bg-fill-040 border border-line-080">
                                <span className="px-3 text-[11px] font-mono text-tone-650 animate-pulse min-w-24 text-center">
                                    {openBind || "Recording..."}
                                </span>
                                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-sm hover:bg-fill-100 text-tone-400 hover:text-tone-700" onClick={() => setListeningToKeyboard(false)}>
                                    <X size={12} />
                                </Button>
                                <Button size="icon" className="h-6 w-6 rounded-sm bg-ink text-surface hover:bg-ink/90" onClick={confirmChangeBind}>
                                    {bindLoad ? <Spinner /> : <Check size={12} />}
                                </Button>
                            </div>
                        ) : (
                            <Button variant="outline" className="h-8 rounded-md border-line-080 hover:bg-fill-050 hover:border-line-150 px-3 text-tone-600 hover:text-tone-850 text-[12px]" onClick={() => setListeningToKeyboard(true)}>
                                Change
                            </Button>
                        )}
                    </div>
                </SettingCard>

                <SettingCard
                    anchor="open-on-startup"
                    icon={Power}
                    title="Open on Startup"
                    description="Automatically launch Volt when you sign in to your computer."
                >
                    <div className="flex items-center gap-2">
                        <Toggle checked={openOnStartup} onChange={() => toggleOpenOnStartup(!openOnStartup)} />
                        <div className={`transition-all duration-300 ${startupSaved ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
                            <Check size={12} className="text-green-400/70" />
                        </div>
                    </div>
                </SettingCard>

                <div className="pt-7">
                    <div className="flex items-center gap-1.5 mb-3">
                        <AlertTriangle size={11} className="text-red-400/55" />
                        <GroupLabel accent="danger">Danger Zone</GroupLabel>
                    </div>
                    <div className="space-y-2">
                        <SettingCard
                            anchor="clear-history"
                            isDestructive
                            icon={History}
                            title="Clear History"
                            description="Delete all recent searches and usage statistics from your local device."
                        >
                            <DeleteHistorySection />
                        </SettingCard>

                        <SettingCard
                            anchor="factory-reset"
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
