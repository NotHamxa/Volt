import { useState, useRef, useEffect, ReactNode, useLayoutEffect } from "react";
import { useNavigate } from "react-router";
import { Settings, Hash, FolderOpen, Info, Terminal, Lightbulb, Sparkles, ArrowLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useEscape } from "@/hooks/useEscape.ts";
import GeneralSettingsSection from "@/sections/generalSection.tsx";
import FoldersSection from "@/sections/foldersSection.tsx";
import QuickBangsSection from "@/sections/bangsSection.tsx";
import AboutSection from "@/sections/aboutSection.tsx";
import CommandsSection from "@/sections/commandsSection.tsx";
import TipsSection from "@/sections/tipsSection.tsx";
import AiSection from "@/sections/aiSection.tsx";

type SectionId = "settings" | "folders" | "commands" | "bangs" | "ai" | "tips" | "about";

interface NavItem {
    id: SectionId;
    label: string;
    short: string;
    icon: typeof Settings;
}

const NAV: NavItem[] = [
    { id: "settings", label: "General",          short: "General", icon: Settings },
    { id: "folders",  label: "Search Index",     short: "Index",   icon: FolderOpen },
    { id: "commands", label: "Commands",         short: "Cmds",    icon: Terminal },
    { id: "bangs",    label: "Quick Bangs",      short: "Bangs",   icon: Hash },
    { id: "ai",       label: "AI",               short: "AI",      icon: Sparkles },
    { id: "tips",     label: "Tips & Shortcuts", short: "Tips",    icon: Lightbulb },
    { id: "about",    label: "About",            short: "About",   icon: Info },
];

function AnimatedSection({ active, children }: { active: boolean; children: ReactNode }) {
    // Only the active section participates in layout — prevents the content
    // area from briefly doubling in height during a tab switch (which pushes
    // the app footer around).
    const [fadeIn, setFadeIn] = useState(false);
    useEffect(() => {
        if (active) {
            setFadeIn(false);
            const id = requestAnimationFrame(() => requestAnimationFrame(() => setFadeIn(true)));
            return () => cancelAnimationFrame(id);
        }
    }, [active]);

    if (!active) return null;

    return (
        <div className={`transition-opacity duration-150 ease-out ${fadeIn ? "opacity-100" : "opacity-0"}`}>
            {children}
        </div>
    );
}

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState<SectionId>("settings");
    const [pendingSection, setPendingSection] = useState<SectionId | null>(null);
    const [appVersion, setAppVersion] = useState("");
    const hasUnsavedRef = useRef(false);
    const navigate = useNavigate();

    // Sliding-highlight measurement
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const trackRef = useRef<HTMLDivElement>(null);
    const [pill, setPill] = useState({ left: 0, width: 0 });
    // The highlight follows the pointer and falls back to the open section, so
    // one moving block does the work of both a hover state and a selection
    // marker. null means "nothing hovered".
    const [hovered, setHovered] = useState<number | null>(null);

    useEffect(() => {
        window.electron.getAppVersion().then(setAppVersion);
    }, []);

    useLayoutEffect(() => {
        const idx = hovered ?? NAV.findIndex(n => n.id === activeSection);
        const btn = tabRefs.current[idx];
        const track = trackRef.current;
        if (!btn || !track) return;
        const tRect = track.getBoundingClientRect();
        const bRect = btn.getBoundingClientRect();
        setPill({ left: bRect.left - tRect.left, width: bRect.width });
    }, [activeSection, hovered]);

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

    const cancelDiscard = () => setPendingSection(null);
    const goBack = () => navigate('/');

    // Esc closes the discard-changes modal first; only when no modal is open
    // does App.tsx's Esc handler run (which navigates back to search).
    useEscape(cancelDiscard, !!pendingSection);

    return (
        <div className="flex flex-col w-full h-full text-tone-800">
            {/* ── Top header — back, title, version, hint ─────────────────── */}
            <header className="flex items-center gap-3 px-4 h-[42px] border-b border-line-060 shrink-0">
                <button
                    onClick={goBack}
                    aria-label="Back to search"
                    className="flex items-center gap-1.5 px-2 py-1 -ml-1 rounded-md text-tone-400 hover:text-tone-800 hover:bg-fill-050 transition-colors"
                >
                    <ArrowLeft size={13} strokeWidth={2.2} />
                    <span className="text-[11px] font-medium">Back</span>
                </button>

                <div className="h-3.5 w-px bg-fill-070" />

                <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-tone-700 tracking-[-0.01em]">Settings</span>
                    {appVersion && (
                        <span className="text-[10px] font-mono text-tone-250">v{appVersion}</span>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-tone-250">Close</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-fill-050 border border-line-080 text-tone-400 font-mono">Ctrl</span>
                    <span className="text-tone-150 text-[10px]">+</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-fill-050 border border-line-080 text-tone-400 font-mono">H</span>
                </div>
            </header>

            {/* ── Tab nav: one highlight slides between tabs ──────────────── */}
            <div className="px-4 pt-3 pb-2 shrink-0">
                <div
                    ref={trackRef}
                    onMouseLeave={() => setHovered(null)}
                    className="relative flex items-center gap-0.5 py-1 w-full border-b border-line-050"
                >
                    {/* No track behind the tabs — the moving block is the only
                        chrome, which keeps the row quiet until you reach for it. */}
                    <div
                        aria-hidden
                        className="absolute top-1 bottom-1 rounded-lg bg-fill-060 transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
                        style={{ left: pill.left, width: pill.width }}
                    />
                    {NAV.map((item, i) => {
                        const Icon = item.icon;
                        const active = activeSection === item.id;
                        return (
                            <button
                                key={item.id}
                                ref={el => { tabRefs.current[i] = el; }}
                                onClick={() => handleSectionChange(item.id)}
                                onMouseEnter={() => setHovered(i)}
                                onFocus={() => setHovered(i)}
                                aria-current={active ? "page" : undefined}
                                className={`relative z-10 flex items-center justify-center gap-1.5 flex-1 h-7 rounded-lg transition-colors duration-150 cursor-pointer ${
                                    active ? "text-tone-900" : "text-tone-400 hover:text-tone-800"
                                }`}
                            >
                                <Icon size={12} strokeWidth={active ? 2.4 : 1.8} />
                                <span className={`text-[11px] ${active ? "font-medium" : "font-normal"}`}>
                                    {item.short}
                                </span>
                                {/* The highlight can wander off to whatever is
                                    hovered, so the open section needs a marker
                                    that stays put. */}
                                {active && (
                                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full bg-ink/70" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <ScrollArea className="flex-1 min-h-0">
                <div className="max-w-2xl mx-auto pt-6 pb-12 px-9">
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
                        <AnimatedSection active={activeSection === "ai"}>
                            <AiSection />
                        </AnimatedSection>
                        <AnimatedSection active={activeSection === "tips"}>
                            <TipsSection />
                        </AnimatedSection>
                        <AnimatedSection active={activeSection === "about"}>
                            <AboutSection />
                        </AnimatedSection>
                    </div>
                </ScrollArea>

            {/* ── Discard-changes modal ───────────────────────────────────── */}
            {pendingSection && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim-strong)] backdrop-blur-[6px]">
                    <div className="bg-surface-modal/[0.98] border border-line-070 rounded-2xl p-6 w-80 shadow-[0_40px_90px_var(--shadow-3),inset_0_1px_0_var(--edge-hi)]">
                        <h3 className="text-[14px] font-semibold text-tone-850 mb-2 tracking-[-0.01em]">Discard changes?</h3>
                        <p className="text-[12px] text-tone-400 mb-5 leading-relaxed">You have unsaved changes. They will be lost if you switch sections.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={cancelDiscard} className="px-4 py-2 text-[12px] text-tone-450 hover:text-tone-700 rounded-lg hover:bg-fill-050 transition-colors">
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
