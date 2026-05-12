import { useEffect, useLayoutEffect, useRef, useState, useCallback, CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEscape } from "@/hooks/useEscape.ts";

type Step = {
    selector?: string;
    title: string;
    body: string;
    placement?: "top" | "bottom" | "left" | "right";
    padding?: number;
    nextLabel?: string;
    onNext?: (nav: ReturnType<typeof useNavigate>) => void;
    centered?: boolean;
};

const STEPS: Step[] = [
    {
        selector: '[data-walkthrough="search-input"]',
        title: "Search anything",
        body: "Type to find apps, files, commands, and settings — all at once. This bar is the whole app.",
        placement: "bottom",
        padding: 6,
    },
    {
        selector: '[data-walkthrough="mode-toggle"]',
        title: "Tab to switch to web",
        body: "Press Tab to toggle between your system and the web. Add a bang like !yt or !g to jump straight to a site.",
        placement: "bottom",
        padding: 6,
    },
    {
        selector: '[data-walkthrough="settings-btn"]',
        title: "Everything else lives here",
        body: "Pin apps, rebind the shortcut, add custom commands, watched folders, bangs. Ctrl+H opens it any time.",
        placement: "top",
        padding: 6,
        nextLabel: "Open Settings",
        onNext: (nav) => nav("/settings"),
    },
    {
        title: "You're set",
        body: "Press Esc or Ctrl+H to come back to search. Have fun.",
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

    const current = STEPS[step];

    const measure = useCallback(() => {
        if (!current?.selector) {
            setRect(null);
            return;
        }
        const el = document.querySelector(current.selector);
        setRect(el ? el.getBoundingClientRect() : null);
    }, [current]);

    useLayoutEffect(() => {
        if (!open) return;
        // Re-measure across a few frames — target may have just mounted (e.g. after nav)
        let frames = 0;
        let id: number;
        const tick = () => {
            measure();
            if (++frames < 6) id = requestAnimationFrame(tick);
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

    const close = useCallback(() => {
        setStep(0);
        setRect(null);
        onClose();
    }, [onClose]);

    useEscape(close, open);

    function next() {
        if (current.onNext) current.onNext(navigate);
        if (step >= STEPS.length - 1) close();
        else setStep(step + 1);
    }

    if (!open) return null;

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
                        className="absolute bg-black/55 pointer-events-auto"
                        style={{ top: 0, left: 0, right: 0, height: Math.max(0, target.top) }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute bg-black/55 pointer-events-auto"
                        style={{ top: target.top + target.height, left: 0, right: 0, bottom: 0 }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute bg-black/55 pointer-events-auto"
                        style={{ top: target.top, left: 0, width: Math.max(0, target.left), height: target.height }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute bg-black/55 pointer-events-auto"
                        style={{ top: target.top, left: target.left + target.width, right: 0, height: target.height }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.div
                        className="absolute rounded-lg ring-2 ring-white/45 pointer-events-none"
                        style={{ top: target.top, left: target.left, width: target.width, height: target.height }}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25 }}
                    />
                </>
            ) : (
                <motion.div
                    className="absolute inset-0 bg-black/65 backdrop-blur-[2px] pointer-events-auto"
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
                    className="absolute pointer-events-auto rounded-xl bg-[rgba(14,14,14,0.98)] border border-white/[0.09] shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)] p-3.5"
                >
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] uppercase tracking-widest text-white/25">
                            {step + 1} / {STEPS.length}
                        </p>
                        <button
                            onClick={close}
                            className="text-[10px] text-white/25 hover:text-white/55 transition-colors"
                        >
                            Skip
                        </button>
                    </div>
                    <h3 className="text-[14px] font-semibold text-white tracking-[-0.01em] mb-1.5">{current.title}</h3>
                    <p className="text-[12px] text-white/45 leading-relaxed mb-3.5">{current.body}</p>
                    <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1 rounded-full transition-all duration-200 ${i === step ? "w-4 bg-white/75" : "w-1 bg-white/15"}`}
                                />
                            ))}
                        </div>
                        <button
                            onClick={next}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-black bg-white hover:opacity-90 active:scale-[0.98] transition-all"
                        >
                            {current.nextLabel ?? "Next"}
                        </button>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
