import { Button } from "@/components/ui/button.tsx";
import { Check, X, Keyboard, AlertTriangle, History } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SettingCard, DeleteHistorySection, ResetAppData } from "@/components/settingsCard.tsx";

interface GeneralSettingsSectionProps {
    listeningToKeyboard: boolean;
    setListeningToKeyboard: (value: boolean) => void;
    openBind: string;
    bindLoad: boolean;
    currentOpenBind: string;
    confirmChangeBind: () => void;
}

export default function GeneralSettingsSection({
                                                   listeningToKeyboard,
                                                   setListeningToKeyboard,
                                                   openBind,
                                                   bindLoad,
                                                   currentOpenBind,
                                                   confirmChangeBind
                                               }: GeneralSettingsSectionProps) {
    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <header>
                <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">General</h2>
                <p className="text-gray-400 text-sm">Configure how you interact with the application.</p>
            </header>

            <div className="space-y-4">
                <SettingCard
                    icon={Keyboard}
                    title="Activation Shortcut"
                    description="The global keyboard combination used to toggle the search bar."
                >
                    <div className="flex items-center gap-2">
                        {listeningToKeyboard ? (
                            <div className="flex items-center gap-2 bg-blue-500/10 p-1 rounded-xl border border-blue-500/30">
                                <span className="px-4 text-sm font-mono text-blue-400 animate-pulse min-w-25 text-center">
                                    {openBind || "Recording..."}
                                </span>
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/10" onClick={() => setListeningToKeyboard(false)}>
                                    <X size={14} />
                                </Button>
                                <Button size="icon" className="h-8 w-8 bg-blue-600 hover:bg-blue-500" onClick={confirmChangeBind}>
                                    {bindLoad ? <Spinner /> : <Check size={14} />}
                                </Button>
                            </div>
                        ) : (
                            <Button variant="outline" className="h-10 rounded-xl border-white/10 hover:bg-white/10 px-4" onClick={() => setListeningToKeyboard(true)}>
                                <span className="font-mono mr-4 text-xs text-gray-400 bg-white/5 px-2 py-1 rounded">{currentOpenBind}</span>
                                Change
                            </Button>
                        )}
                    </div>
                </SettingCard>

                <div className="pt-8 mt-4 border-t border-white/5">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-red-500/60 mb-6 flex items-center gap-2">
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