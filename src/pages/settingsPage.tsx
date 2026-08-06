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
    const [pill, setPill] = useState({ top: 0, height: 0 });
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
        setPill({ top: bRect.top - tRect.top, height: bRect.height });
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

    const current = NAV.find(n => n.id === activeSection);

    return (
        <div className="flex flex-col w-full h-full text-tone-800">
            {/* ── Top bar — just the way out. The section names moved to the
                   rail, so this no longer has to label the page. ──────────── */}
            <header className="flex items-center gap-3 px-3.5 h-11 shrink-0">
                <button
                    onClick={goBack}
                    aria-label="Back to search"
                    className="flex items-center gap-1.5 px-2 py-1 -ml-1 rounded-md text-tone-400 hover:text-tone-800 hover:bg-fill-050 transition-colors cursor-pointer"
                >
                    <ArrowLeft size={13} strokeWidth={2.2} />
                    <span className="text-[11px] font-medium">Back</span>
                </button>

                <div className="ml-auto flex items-center gap-2.5">
                    {appVersion && (
                        <span className="text-[10px] font-mono text-tone-250">v{appVersion}</span>
                    )}
                    <div className="flex items-center gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-fill-050 text-tone-400 font-mono">Ctrl</span>
                        <span className="text-tone-200 text-[10px]">+</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-fill-050 text-tone-400 font-mono">H</span>
                    </div>
                </div>
            </header>

            {/* ── Rail + content ──────────────────────────────────────────
                   A vertical rail rather than a tab row: the window is only
                   550px tall, and a horizontal strip spent 44px of that while
                   still forcing "Commands" down to "Cmds". Down the side it
                   costs no height, the names fit, and another section can be
                   added without the row getting tighter. ─────────────────── */}
            <div className="flex-1 min-h-0 flex">
                <nav
                    ref={trackRef}
                    onMouseLeave={() => setHovered(null)}
                    className="relative w-[164px] shrink-0 flex flex-col gap-px px-2.5 pb-3 border-r border-line-050"
                >
                    {/* One block follows the pointer and settles back on the
                        open section, so the rail stays quiet until reached for. */}
                    <div
                        aria-hidden
                        className="absolute left-2.5 right-2.5 rounded-lg bg-fill-060 transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
                        style={{ top: pill.top, height: pill.height }}
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
                                className={`relative z-10 flex items-center gap-2.5 h-8 px-2.5 rounded-lg transition-colors duration-150 cursor-pointer ${
                                    active ? "text-tone-900" : "text-tone-400 hover:text-tone-800"
                                }`}
                            >
                                {/* The highlight wanders off to whatever is
                                    hovered, so the open section keeps a marker
                                    of its own. */}
                                <span
                                    className={`absolute left-0 w-[2px] rounded-full bg-ink/75 transition-all duration-200 ${
                                        active ? "h-4 opacity-100" : "h-0 opacity-0"
                                    }`}
                                />
                                <Icon size={13} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
                                <span className={`text-[11.5px] truncate ${active ? "font-medium" : "font-normal"}`}>
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {/* ── Content ─────────────────────────────────────────────── */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="px-7 pt-5 pb-12">
                        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-tone-900 mb-4">
                            {current?.label}
                        </h1>
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
            </div>

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
