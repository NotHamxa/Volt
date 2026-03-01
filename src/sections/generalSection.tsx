import { Button } from "@/components/ui/button.tsx";
import { Check, X, Keyboard, AlertTriangle, History, Power } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SettingCard, DeleteHistorySection, ResetAppData } from "@/components/settingsCard.tsx";

interface GeneralSettingsSectionProps {
    listeningToKeyboard: boolean;
    setListeningToKeyboard: (value: boolean) => void;
    openBind: string;
    bindLoad: boolean;
    currentOpenBind: string;
    confirmChangeBind: () => void;
    openOnStartup: boolean;
    toggleOpenOnStartup: (enabled: boolean) => void;
}

export default function GeneralSettingsSection({
                                                   listeningToKeyboard,
                                                   setListeningToKeyboard,
                                                   openBind,
                                                   bindLoad,
                                                   currentOpenBind,
                                                   confirmChangeBind,
                                                   openOnStartup,
                                                   toggleOpenOnStartup
                                               }: GeneralSettingsSectionProps) {
    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
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
                    <div className="flex items-center gap-2">
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
                                <span className="font-mono mr-4 text-xs text-white/35 bg-white/5 px-2 py-1 rounded border border-white/8">{currentOpenBind}</span>
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
                </SettingCard>

                <div className="pt-8 mt-4 border-t border-white/5">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-red-400/50 mb-6 flex items-center gap-2">
                        <AlertTriangle size={12} /> Privacy & Storage
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