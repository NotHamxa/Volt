import { useEffect, useState } from "react";
import { Check, AlertTriangle, History, Power, Palette, Monitor, Sun, Moon } from "lucide-react";
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
    /**
     * Kept for the discard-changes guard in the settings shell. Nothing in
     * this section holds an in-progress edit any more — the shortcut recorder
     * that did moved to the Shortcuts section, where cancelling is local.
     */
    setHasUnsaved?: (val: boolean) => void;
}

export default function GeneralSettingsSection({}: GeneralSettingsSectionProps) {
    const [openOnStartup, setOpenOnStartup] = useState(false);
    const [startupSaved, setStartupSaved] = useState(false);

    useEffect(() => {
        window.electron.getOpenOnStartup().then(v => setOpenOnStartup(v ?? false));
    }, []);

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
                {/* The activation shortcut lives in Shortcuts now, alongside
                    every other binding, rather than being the one key you could
                    change from a page that lists none of the others. */}
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
