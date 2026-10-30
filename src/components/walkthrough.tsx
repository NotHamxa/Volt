import { useEffect, useLayoutEffect, useRef, useState, useCallback, CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router";
import { useEscape } from "@/hooks/useEscape.ts";
import { useKeybindings } from "@/hooks/useKeybindings.ts";
import { setTouring } from "@/components/walkthroughState.ts";

type Step = {
    selector?: string;
    title: string;
    /** A function when it names a shortcut, since those can be rebound. */
    body: string | ((keys: StepKeys) => string);
    placement?: "top" | "bottom" | "left" | "right";
    padding?: number;
    nextLabel?: string;
    centered?: boolean;
    /**
     * The page the step is shown on; the tour goes there itself, forwards or
     * back. Home when unset.
     */
    route?: string;
    /** On the Settings page, the section to open for it. */
    section?: string;
};

/** The shortcuts a step can name, as currently bound. Null when unbound. */
type StepKeys = {
    settings: string | null;
    ai: string | null;
    preview: string | null;
    open: string | null;
    prevChat: string | null;
    nextChat: string | null;
};

/**
 * The tour: search and the home screen, then the AI view, then the parts of
 * Settings worth knowing about, each shown on its own page, so it ends with
 * the person having actually been to every place it mentions.
 */
const STEPS: Step[] = [
    {
        selector: '[data-walkthrough="search-input"]',
        title: "Search everything",
        body: (keys) => `Apps, files, commands, settings and your pinned links in one list, with the web underneath. Add a bang like !yt to search a site directly.${keys.preview ? ` ${keys.preview} previews the highlighted result.` : ""}`,
        placement: "bottom",
        padding: 6,
    },
    {
        selector: '[data-walkthrough="pinned-apps"]',
        title: "Your apps, your way",
        body: "Pin the apps you use from search or All apps. Drag one onto another to group them, or rest on a tile's edge to reorder.",
        placement: "bottom",
        padding: 4,
    },
    {
        selector: '[data-walkthrough="links-dock"]',
        title: "Links in the dock",
        body: "Your favourite sites live here, always in the same spot. Ctrl + 1–9 opens the first nine, and they show up in search too.",
        placement: "top",
        padding: 4,
        nextLabel: "Show me AI",
    },

    // --- the AI view ---------------------------------------------------------
    {
        route: "/ai",
        selector: '[data-walkthrough="ai-composer"]',
        title: "Ask AI",
        body: (keys) => `Ask anything here${keys.ai ? `. ${keys.ai} brings you here from search` : ""}. Answers show each step the AI takes where it happened: the files it read, the commands it ran, what it was thinking. Paste, drop or attach files and images too.`,
        placement: "top",
        padding: 4,
    },
    {
        route: "/ai",
        selector: '[data-walkthrough="ai-model"]',
        title: "Pick a model",
        body: "Claude Code or Codex, on the plan you're already signed in to, and any model id you type.",
        placement: "top",
        padding: 4,
    },
    {
        route: "/ai",
        selector: '[data-walkthrough="ai-mode"]',
        title: "Decide what it may do",
        body: "Ask first approves every command and file change. Auto-edit lets edits through, Auto has a reviewer approve routine steps, and Full access runs anything. Your pick becomes the default.",
        placement: "top",
        padding: 4,
    },
    {
        route: "/ai",
        selector: '[data-walkthrough="ai-history"]',
        title: "Your chats",
        body: (keys) => `Past conversations are kept here. Hover to see them${keys.prevChat && keys.nextChat ? `, or step through them with ${keys.prevChat} and ${keys.nextChat}` : ""}. Each remembers its model, its mode and what you'd started typing, and a reply keeps going if you leave.`,
        placement: "right",
        padding: 4,
    },
    {
        route: "/ai",
        selector: '[data-walkthrough="ai-pin"]',
        title: "Stays open while you chat",
        body: "Volt won't hide when you click away from a chat, so an answer isn't cut off. Click the pin to change that.",
        placement: "left",
        padding: 4,
        nextLabel: "Show me Settings",
    },

    // --- Settings ------------------------------------------------------------
    {
        route: "/settings",
        section: "settings",
        selector: '[data-walkthrough="settings-settings"]',
        title: "General",
        body: "Light or dark theme, starting with Windows, and how Volt opens.",
        placement: "right",
        padding: 3,
    },
    {
        route: "/settings",
        section: "keys",
        selector: '[data-walkthrough="settings-keys"]',
        title: "Shortcuts",
        body: (keys) => `Every key Volt responds to, and the ones you can change${keys.open ? `, like ${keys.open}, which opens Volt` : ""}.`,
        placement: "right",
        padding: 3,
    },
    {
        route: "/settings",
        section: "apps",
        selector: '[data-walkthrough="settings-apps"]',
        title: "Hotkeys for apps and links",
        body: "Give any app (or, under Links, any site) a hotkey that opens it from anywhere in Windows, even when Volt is hidden.",
        placement: "right",
        padding: 3,
    },
    {
        route: "/settings",
        section: "folders",
        selector: '[data-walkthrough="settings-folders"]',
        title: "What gets searched",
        body: "Choose which folders Volt indexes for file search. Your Desktop and Downloads are in from the start.",
        placement: "right",
        padding: 3,
    },
    {
        route: "/settings",
        section: "ai",
        selector: '[data-walkthrough="settings-ai"]',
        title: "AI providers",
        body: "Not set up yet? A step-by-step guide gets you going with a Claude or ChatGPT plan. This is also where you pick the default model and the folder AI tools work in.",
        placement: "right",
        padding: 3,
    },
    {
        title: "You're set",
        body: (keys) => `${keys.open ? `${keys.open} brings Volt up from anywhere, and ` : ""}Esc puts it away. Have fun.`,
        centered: true,
        nextLabel: "Done",
    },
];

interface WalkthroughProps {
    open: boolean;
    onClose: () => void;
}

const TOOLTIP_WIDTH = 248;
const VIEWPORT_MARGIN = 10;

export function Walkthrough({ open, onClose }: WalkthroughProps) {
    const [step, setStep] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [tooltipHeight, setTooltipHeight] = useState(140);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { get: bindingFor } = useKeybindings();
    const keys: StepKeys = {
        settings: bindingFor("open-settings") || null,
        ai: bindingFor("open-ai") || null,
        preview: bindingFor("toggle-preview") || null,
        open: bindingFor("open-volt") || null,
        prevChat: bindingFor("ai-prev-chat") || null,
        nextChat: bindingFor("ai-next-chat") || null,
    };
    const location = useLocation();

    const current = STEPS[step];

    // Read by the AI view, which holds off its setup redirect mid-tour.
    useEffect(() => {
        setTouring(open);
        return () => setTouring(false);
    }, [open]);

    const measure = useCallback(() => {
        const el = current?.selector ? document.querySelector(current.selector) : null;
        const next = el ? el.getBoundingClientRect() : null;
        // Only a real move re-renders, this runs every frame.
        setRect(prev => (
            prev === next || (prev && next && prev.top === next.top && prev.left === next.left
                && prev.width === next.width && prev.height === next.height)
                ? prev
                : next
        ));
    }, [current]);

    // Followed for as long as the step is up, not just as it opens: the
    // target can mount late (a page the tour just went to) or move once it
    // has (the AI composer gains its effort menu when the model list loads,
    // pushing the mode menu along), and the highlight stayed behind.
    useLayoutEffect(() => {
        if (!open) return;
        let id: number;
        const tick = () => {
            measure();
            id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [open, step, measure]);

    useEffect(() => {
        if (!open) return;
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
        };
    }, [open, measure]);

    // Each step is shown on its own page: going forwards or back, the tour
    // takes you there, and to the Settings section it's about.
    const route = current?.route ?? "/";
    const section = current?.section;
    useEffect(() => {
        if (!open) return;
        if (location.pathname !== route) navigate(route);
        if (!section) return;
        // Settings may only just be mounting; asking a few times is harmless,
        // since opening the section that's already open does nothing.
        const ask = () => window.dispatchEvent(new CustomEvent("walkthrough:settings-section", { detail: section }));
        const timers = [0, 80, 250].map(ms => window.setTimeout(ask, ms));
        return () => timers.forEach(t => window.clearTimeout(t));
    }, [open, route, section, location.pathname, navigate]);

    const close = useCallback(() => {
        setStep(0);
        setRect(null);
        onClose();
        // The tour started on the home screen; it ends there too.
        navigate("/");
    }, [onClose, navigate]);

    useEscape(close, open);

    const next = useCallback(() => {
        if (step >= STEPS.length - 1) close();
        else setStep(step + 1);
    }, [close, step]);

    const back = useCallback(() => {
        if (step > 0) setStep(step - 1);
    }, [step]);

    // Enter or → steps on, ← steps back. The tour holds the keyboard while it's
    // up: captured on window, so nothing reaches the search box behind it or
    // the app's own shortcuts. Escape is left to useEscape, which closes it.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.repeat) return;
            if (e.key === "Enter" || e.key === "ArrowRight") next();
            else if (e.key === "ArrowLeft") back();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, next, back]);

    if (!open) return null;

    const body = typeof current.body === "function" ? current.body(keys) : current.body;

    const padding = current.padding ?? 6;
    const target = rect && !current.centered
        ? {
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
        }
        : null;

    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const tw = TOOLTIP_WIDTH;
    const th = tooltipHeight;

    let tooltipStyle: CSSProperties;
    if (!target) {
        tooltipStyle = {
            top: Math.max(VIEWPORT_MARGIN, (vh - th) / 2),
            left: Math.max(VIEWPORT_MARGIN, (vw - tw) / 2),
        };
    } else {
        let placement = current.placement ?? "bottom";
        const margin = 12;

        // Auto-flip vertically if there's no room
        if (placement === "bottom" && target.top + target.height + margin + th > vh - VIEWPORT_MARGIN) {
            placement = "top";
        } else if (placement === "top" && target.top - margin - th < VIEWPORT_MARGIN) {
            placement = "bottom";
        }

        let top: number;
        let left: number;
        if (placement === "bottom") {
            top = target.top + target.height + margin;
            left = target.left + target.width / 2 - tw / 2;
        } else if (placement === "top") {
            top = target.top - margin - th;
            left = target.left + target.width / 2 - tw / 2;
        } else if (placement === "left") {
            top = target.top + target.height / 2 - th / 2;
            left = target.left - margin - tw;
        } else {
            top = target.top + target.height / 2 - th / 2;
            left = target.left + target.width + margin;
        }

        // Clamp to viewport
        left = Math.min(Math.max(VIEWPORT_MARGIN, left), vw - tw - VIEWPORT_MARGIN);
        top = Math.min(Math.max(VIEWPORT_MARGIN, top), vh - th - VIEWPORT_MARGIN);

        tooltipStyle = { top, left };
    }

    return (
        <div className="fixed inset-0 z-[60] pointer-events-none">
            {target ? (
                <>
                    <motion.div
                        className="absolute bg-[var(--scrim)] pointer-events-auto"
                        style={{ top: 0, left: 0, right: 0, height: Math.max(0, target.top) }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute bg-[var(--scrim)] pointer-events-auto"
                        style={{ top: target.top + target.height, left: 0, right: 0, bottom: 0 }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute bg-[var(--scrim)] pointer-events-auto"
                        style={{ top: target.top, left: 0, width: Math.max(0, target.left), height: target.height }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute bg-[var(--scrim)] pointer-events-auto"
                        style={{ top: target.top, left: target.left + target.width, right: 0, height: target.height }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute rounded-lg ring-2 ring-ink/45 pointer-events-none"
                        style={{ top: target.top, left: target.left, width: target.width, height: target.height }}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25 }}
                    />
                </>
            ) : (
                <motion.div
                    className="absolute inset-0 bg-[var(--scrim-strong)] backdrop-blur-[2px] pointer-events-auto"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    onClick={close}
                />
            )}

            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    ref={(el) => {
                        tooltipRef.current = el;
                        if (el) {
                            const h = el.offsetHeight;
                            if (h && h !== tooltipHeight) setTooltipHeight(h);
                        }
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    style={{ ...tooltipStyle, width: TOOLTIP_WIDTH }}
                    className="absolute pointer-events-auto rounded-xl bg-surface-modal/[0.98] border border-line-090 shadow-[0_20px_50px_var(--shadow-3),inset_0_1px_0_var(--edge-hi)] p-3.5"
                >
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-10 uppercase tracking-widest text-tone-250">
                            {step + 1} / {STEPS.length}
                        </p>
                        <button
                            onClick={close}
                            className="text-10 text-tone-250 hover:text-tone-550 transition-colors"
                        >
                            Skip
                        </button>
                    </div>
                    <h3 className="text-14 font-semibold text-ink tracking-[-0.01em] mb-1.5">{current.title}</h3>
                    <p className="text-12 text-tone-450 leading-relaxed mb-3.5">{body}</p>
                    <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1 rounded-full transition-all duration-200 ${i === step ? "w-4 bg-ink/75" : "w-1 bg-fill-150"}`}
                                />
                            ))}
                        </div>
                        <button
                            onClick={next}
                            className="px-3 py-1.5 rounded-lg text-11 font-medium text-surface bg-ink hover:opacity-90 active:scale-[0.98] transition-all"
                        >
                            {current.nextLabel ?? "Next"}
                        </button>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
