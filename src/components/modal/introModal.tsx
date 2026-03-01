import { useState, useRef, useEffect, ReactNode, Dispatch, SetStateAction } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {ChevronRight, ChevronLeft, Search, Pin, Folder, Globe, Hash, Command, Link} from "lucide-react";

import logo from "@/assets/icon.png";
function ScrollIndicator({ visible }: { visible: boolean }) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pb-3 pointer-events-none"
                >
                    <div className="w-px h-5 bg-linear-to-b from-transparent to-white/15" />
                    <div className="flex gap-0.75">
                        {[0, 1, 2].map((i) => (
                            <motion.div
                                key={i}
                                className="w-0.75 h-0.75 rounded-full bg-white/25"
                                animate={{ opacity: [0.25, 0.8, 0.25] }}
                                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                            />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function PageDots({ total, current }: { total: number; current: number }) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
                <motion.div
                    key={i}
                    animate={{
                        height: i === current ? 20 : 6,
                        opacity: i === current ? 1 : i < current ? 0.3 : 0.15,
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="w-0.75 rounded-full bg-white"
                />
            ))}
        </div>
    );
}

function IntroPage({ children }: { children: ReactNode }) {
    return <div className="flex flex-col gap-5">{children}</div>;
}

function FeatureRow({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
    return (
        <div className="flex gap-3.5 items-start">
            <div className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-white/5 border border-white/8">
                <Icon size={14} className="text-white/60" strokeWidth={1.5} />
            </div>
            <div>
                <p className="text-[13px] font-medium text-white/80 mb-0.5">{title}</p>
                <p className="text-[12px] text-white/35 leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}

function KbdKey({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium text-white/60 font-mono bg-white/[0.07] border border-white/[0.12] shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            {children}
        </kbd>
    );
}

function Callout({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-[12px] text-white/40 leading-relaxed bg-white/[0.04] border border-white/[0.07]">
            {children}
        </div>
    );
}

const PAGES: ReactNode[] = [
    <IntroPage>
        <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-2">Getting started</p>
            <h2 className="text-[22px] font-semibold text-white leading-tight tracking-[-0.03em]">
                Opening Volt
            </h2>
        </div>
        <p className="text-[13px] text-white/40 leading-relaxed">
            Volt lives in the background and is ready the moment you need it.
        </p>
        <div className="flex items-center justify-center gap-2 py-5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            <KbdKey>Ctrl</KbdKey>
            <span className="text-white/20 text-sm">+</span>
            <KbdKey>Space</KbdKey>
        </div>
        <Callout>
            <Command size={13} className="mt-0.5 shrink-0 text-white/30" strokeWidth={1.5} />
            <span>You can change this shortcut at any time in <span className="text-white/60">Settings → General</span>.</span>
        </Callout>
    </IntroPage>,


    <IntroPage>
        <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-2">Search</p>
            <h2 className="text-[22px] font-semibold text-white leading-tight tracking-[-0.03em]">
                Find anything, instantly
            </h2>
        </div>
        <p className="text-[13px] text-white/40 leading-relaxed">
            Just start typing — Volt searches across everything on your system at once.
        </p>
        <div className="flex flex-col gap-2 mt-1">
            {[
                { label: "Apps", dim: "Installed applications" },
                { label: "Files & Folders", dim: "From your indexed directories" },
                { label: "System Commands", dim: "Shutdown, restart, display modes…" },
                { label: "Settings", dim: "Jump straight to Windows settings" },
            ].map(({ label, dim }) => (
                <div
                    key={label}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                >
                    <span className="text-[12px] font-medium text-white/70">{label}</span>
                    <span className="text-[11px] text-white/25">{dim}</span>
                </div>
            ))}
        </div>
    </IntroPage>,

    <IntroPage>
        <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-2">Pinning</p>
            <h2 className="text-[22px] font-semibold text-white leading-tight tracking-[-0.03em]">
                Pin what you use most
            </h2>
        </div>
        <p className="text-[13px] text-white/40 leading-relaxed">
            Pin your favourite apps and links — they'll always appear at the top of your results.
        </p>
        <FeatureRow
            icon={Pin}
            title="Right-click to pin"
            desc="Right-click any app in the results list and select Pin to Start."
        />
        <FeatureRow
            icon={Link}
            title="Pin links"
            desc="Give a URL and a name — open your most-visited sites straight from Volt."
        />
        <Callout>
            <Pin size={13} className="mt-0.5 shrink-0 text-white/30" strokeWidth={1.5} />
            <span>You can pin up to <span className="text-white/60">21 apps and 7 links</span>. Right-click to unpin.</span>
        </Callout>
    </IntroPage>,
    <IntroPage>
        <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-2">Files</p>
            <h2 className="text-[22px] font-semibold text-white leading-tight tracking-[-0.03em]">
                Your directories, searchable
            </h2>
        </div>
        <p className="text-[13px] text-white/40 leading-relaxed">
            Tell Volt which folders to watch and your files and folders will surface directly in the search bar.
        </p>
        <FeatureRow
            icon={Folder}
            title="Watch any directory"
            desc="Add your most-used locations and Volt keeps the index up to date automatically."
        />
        <Callout>
            <Search size={13} className="mt-0.5 shrink-0 text-white/30" strokeWidth={1.5} />
            <span>Set this up in <span className="text-white/60">Settings → Search Index</span>.</span>
        </Callout>
    </IntroPage>,

    <IntroPage>
        <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-2">Web Search</p>
            <h2 className="text-[22px] font-semibold text-white leading-tight tracking-[-0.03em]">
                Search the web too
            </h2>
        </div>
        <p className="text-[13px] text-white/40 leading-relaxed">
            Volt can search the web without leaving the launcher. Switch modes with a single key.
        </p>
        <div className="flex items-center gap-3 py-4 px-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            <KbdKey>Tab</KbdKey>
            <span className="text-[12px] text-white/40">toggle between Windows search and web search</span>
        </div>
        <FeatureRow
            icon={Globe}
            title="Stay in flow"
            desc="No need to open a browser just to run a quick search."
        />
    </IntroPage>,

    <IntroPage>
        <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-2">Bangs</p>
            <h2 className="text-[22px] font-semibold text-white leading-tight tracking-[-0.03em]">
                Search shortcuts
            </h2>
        </div>
        <p className="text-[13px] text-white/40 leading-relaxed">
            Bangs let you jump straight to a website's search. Type your query, add a bang, and you're there.
        </p>
        <div className="flex flex-col gap-1.5 px-3.5 py-3 rounded-xl font-mono text-[12px] bg-white/[0.03] border border-white/[0.07]">
            {[
                { q: "rick astley", bang: "!yt", dest: "YouTube" },
                { q: "typescript docs", bang: "!g", dest: "Google" },
                { q: "react hooks", bang: "!r", dest: "Reddit" },
            ].map(({ q, bang, dest }) => (
                <div key={bang} className="flex items-center justify-between">
                    <span className="text-white/40">{q} <span className="text-white/70">{bang}</span></span>
                    <span className="text-[11px] text-white/20">{dest}</span>
                </div>
            ))}
        </div>
        <Callout>
            <Hash size={13} className="mt-0.5 shrink-0 text-white/30" strokeWidth={1.5} />
            <span>See the full list in <span className="text-white/60">Settings → Bangs</span>.</span>
        </Callout>
    </IntroPage>,
];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SLIDE = {
    enter: (dir: number) => ({ x: dir > 0 ? 36 : -36, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -36 : 36, opacity: 0 }),
};

interface IntroModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
}

export function IntroModal({ open, setOpen }: IntroModalProps) {
    const [step, setStep] = useState(-1);
    const [direction, setDirection] = useState(1);
    const [canScroll, setCanScroll] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const isLanding = step === -1;
    const isLast = step === PAGES.length - 1;

    function go(next: number) {
        setDirection(next > step ? 1 : -1);
        setStep(next);
    }

    useEffect(() => {
         if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (isLanding && e.key === "Enter") go(0);
            if (!isLanding && e.key === "ArrowRight") go(Math.min(step + 1, PAGES.length - 1));
            if (!isLanding && e.key === "ArrowLeft") go(Math.max(step - 1, 0));
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [open, isLanding, step]);

    function close() {
        window.electronStore.set("showIntroModal",false)
        setOpen(false);
        setTimeout(() => setStep(-1), 400);
    }

    function checkScroll() {
        const el = scrollRef.current;
        if (!el) return;
        setCanScroll(el.scrollHeight > el.clientHeight + 6);
    }

    useEffect(() => {
        setCanScroll(false);
        const t = setTimeout(checkScroll, 80);
        return () => clearTimeout(t);
    }, [step]);

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.65)] backdrop-blur-[8px]"
            >
                <motion.div
                    initial={{ scale: 0.93, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.93, opacity: 0, y: 16 }}
                    transition={{ duration: 0.38, ease: EASE }}
                    className="relative flex w-115 overflow-hidden rounded-2xl bg-[rgba(12,12,12,0.98)] border border-white/[0.07] shadow-[0_40px_90px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04)] min-h-[400px] max-h-[540px]"
                >
                    {!isLanding && (
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 z-10">
                            <PageDots total={PAGES.length} current={step} />
                        </div>
                    )}

                    <div className="flex flex-col flex-1 min-w-0">
                        <AnimatePresence custom={direction} mode="wait">

                            {isLanding && (
                                <motion.div
                                    key="splash"
                                    custom={direction}
                                    variants={SLIDE}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ duration: 0.28, ease: EASE }}
                                    className="flex flex-col items-center justify-center flex-1 gap-6 px-10 py-14"
                                >
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.08, duration: 0.4 }}
                                        className="text-center"
                                    >
                                        <h1 className="text-[42px] font-semibold text-white leading-none mb-2.5 tracking-[-0.04em]">
                                            Volt
                                        </h1>
                                        <p className="text-[13px] text-white/35 tracking-wide">
                                            Your system, at your fingertips.
                                        </p>
                                    </motion.div>

                                    <motion.img
                                        src={logo}
                                        alt="logo"
                                        className="w-32 h-32 object-contain"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.18, duration: 0.5, ease: EASE }}
                                    />

                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.28, duration: 0.4 }}
                                        className="flex flex-col items-center gap-2.5 w-full"
                                    >
                                        <button
                                            onClick={() => go(0)}
                                            className="w-full py-2.5 rounded-xl text-[13px] font-medium text-black transition-all duration-150 hover:opacity-90 active:scale-[0.98] bg-white"
                                        >
                                            Get started [Enter]
                                        </button>
                                        <button
                                            onClick={close}
                                            className="text-[11px] text-white/20 hover:text-white/45 transition-colors duration-150 py-1"
                                        >
                                            Skip setup
                                        </button>
                                    </motion.div>
                                </motion.div>
                            )}
                            {!isLanding && (
                                <motion.div
                                    key={`page-${step}`}
                                    custom={direction}
                                    variants={SLIDE}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ duration: 0.26, ease: EASE }}
                                    className="flex flex-col flex-1 min-h-0"
                                >
                                    <div className="relative flex-1 min-h-0 overflow-hidden">
                                        <div
                                            ref={scrollRef}
                                            onScroll={checkScroll}
                                            className="h-full overflow-y-auto px-7 pt-8 pb-5 pr-14 [scrollbar-width:none]"
                                        >
                                            {PAGES[step]}
                                        </div>
                                        <ScrollIndicator visible={canScroll} />
                                    </div>

                                    <div className="flex items-center justify-between px-7 py-4.5 border-t border-white/5">
                                        <button
                                            onClick={() => go(step - 1)}
                                            disabled={step === 0}
                                            className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/55 disabled:opacity-0 disabled:pointer-events-none transition-all duration-150"
                                        >
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] bg-white/[0.06] border border-white/10">
                                                <ChevronLeft/>
                                            </span>
                                                Back
                                        </button>

                                        <button
                                            onClick={close}
                                            className="text-[11px] text-white/18 hover:text-white/38 transition-colors duration-150"
                                        >
                                            Skip
                                        </button>

                                        <button
                                            onClick={() => isLast ? close() : go(step + 1)}
                                            className="flex items-center gap-1.5 text-[12px] font-medium text-white/75 hover:text-white transition-colors duration-150"
                                        >
                                            {isLast ? "Done" : "Next"}
                                            {!isLast && (
                                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] bg-white/[0.06] border border-white/10">
                                                    <ChevronRight/>
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
