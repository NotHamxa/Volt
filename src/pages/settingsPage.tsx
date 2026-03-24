import { useState, useRef, useEffect, ReactNode } from "react";
import { Settings, Hash, FolderOpen, Info, Terminal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import GeneralSettingsSection from "@/sections/generalSection.tsx";
import FoldersSection from "@/sections/foldersSection.tsx";
import QuickBangsSection from "@/sections/bangsSection.tsx";
import AboutSection from "@/sections/aboutSection.tsx";
import CommandsSection from "@/sections/commandsSection.tsx";

type SectionId = "settings" | "folders" | "commands" | "bangs" | "about";

const navGroups: { label: string; items: { id: SectionId; label: string; icon: typeof Settings }[] }[] = [
    {
        label: "Configuration",
        items: [
            { id: "settings", label: "General", icon: Settings },
            { id: "folders", label: "Search Index", icon: FolderOpen },
            { id: "commands", label: "Commands", icon: Terminal },
            { id: "bangs", label: "Quick Bangs", icon: Hash },
        ]
    },
    {
        label: "Reference",
        items: [
            { id: "about", label: "About", icon: Info },
        ]
    }
];

function AnimatedSection({ active, children }: { active: boolean; children: ReactNode }) {
    const [shouldRender, setShouldRender] = useState(active);
    const [animClass, setAnimClass] = useState(active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1");

    useEffect(() => {
        if (active) {
            setShouldRender(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setAnimClass("opacity-100 translate-y-0");
                });
            });
        } else {
            setAnimClass("opacity-0 translate-y-1");
            const timer = setTimeout(() => setShouldRender(false), 200);
            return () => clearTimeout(timer);
        }
    }, [active]);

    if (!shouldRender) return null;

    return (
        <div className={`transition-all duration-200 ease-out ${animClass}`}>
            {children}
        </div>
    );
}

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState<SectionId>("settings");
    const [pendingSection, setPendingSection] = useState<SectionId | null>(null);
    const hasUnsavedRef = useRef(false);

    const setHasUnsaved = (val: boolean) => { hasUnsavedRef.current = val; };

    const handleSectionChange = (id: SectionId) => {
        if (id === activeSection) return;
        if (hasUnsavedRef.current) {
            setPendingSection(id);
        } else {
            setActiveSection(id);
        }
    };

    const confirmDiscard = () => {
        hasUnsavedRef.current = false;
        if (pendingSection) {
            setActiveSection(pendingSection);
            setPendingSection(null);
        }
    };

    const cancelDiscard = () => {
        setPendingSection(null);
    };

    return (
        <div className="flex w-full h-full text-white/80">
            {/* Sidebar Navigation */}
            <div className="w-60 border-r border-white/5 flex flex-col py-8 px-4 gap-1">
                <div className="px-3 mb-8">
                    <h1 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/20">Settings</h1>
                </div>
                {navGroups.map((group, gi) => (
                    <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                        <div className="px-3 mb-2 mt-1">
                            <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/15">{group.label}</span>
                        </div>
                        {group.items.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeSection === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleSectionChange(item.id)}
                                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 w-full ${
                                        isActive
                                            ? "bg-white/8 text-white/90"
                                            : "text-white/30 hover:bg-white/5 hover:text-white/60"
                                    }`}
                                >
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-white/70 rounded-full" />
                                    )}
                                    <Icon size={16} />
                                    <span className="text-[13px] font-medium">{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1 max-h-[90vh]">
                    <div className="max-w-3xl mx-auto py-12 px-10">
                        <AnimatedSection active={activeSection === "settings"}>
                            <GeneralSettingsSection setHasUnsaved={setHasUnsaved} />
                        </AnimatedSection>
                        <AnimatedSection active={activeSection === "folders"}>
                            <FoldersSection />
                        </AnimatedSection>
                        <AnimatedSection active={activeSection === "commands"}>
                            <CommandsSection />
                        </AnimatedSection>
                        <AnimatedSection active={activeSection === "bangs"}>
                            <QuickBangsSection />
                        </AnimatedSection>
                        <AnimatedSection active={activeSection === "about"}>
                            <AboutSection />
                        </AnimatedSection>
                    </div>
                </ScrollArea>
            </div>

            {/* Unsaved changes modal */}
            {pendingSection && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[rgba(18,18,18,0.98)] border border-white/10 rounded-2xl p-6 w-80 shadow-2xl">
                        <h3 className="text-[14px] font-semibold text-white/85 mb-2">Discard changes?</h3>
                        <p className="text-[12px] text-white/40 mb-5 leading-relaxed">You have unsaved changes. They will be lost if you switch sections.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={cancelDiscard} className="px-4 py-2 text-[12px] text-white/40 hover:text-white/60 rounded-lg hover:bg-white/5 transition-colors">
                                Stay
                            </button>
                            <button onClick={confirmDiscard} className="px-4 py-2 text-[12px] text-red-400 hover:bg-red-500/15 rounded-lg transition-colors">
                                Discard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
