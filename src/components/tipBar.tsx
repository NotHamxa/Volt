import { useEffect, useState } from "react";
import { Lightbulb, ChevronRight, X, BellOff } from "lucide-react";
import { tips } from "@/data/tips";

const STORE_INDEX_KEY = "tipIndex";
const STORE_DISABLED_KEY = "tipsDisabled";
const SESSION_DISMISS_KEY = "voltTipDismissed";

export default function TipBar() {
    const [index, setIndex] = useState<number>(0);
    const [hidden, setHidden] = useState<boolean>(true);
    const [ready, setReady] = useState<boolean>(false);
    // Starts closed so the home screen is never obstructed.
    const [open, setOpen] = useState<boolean>(false);

    useEffect(() => {
        (async () => {
            const disabled = await window.electronStore.get(STORE_DISABLED_KEY);
            if (disabled === "true") {
                setHidden(true);
                setReady(true);
                return;
            }
            if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
                setHidden(true);
                setReady(true);
                return;
            }
            const stored = await window.electronStore.get(STORE_INDEX_KEY);
            const parsed = parseInt(stored ?? "", 10);
            const start = Number.isFinite(parsed) ? (parsed + 1) % tips.length : 0;
            setIndex(start);
            window.electronStore.set(STORE_INDEX_KEY, String(start));
            setHidden(false);
            setReady(true);
        })();
    }, []);

    const next = () => {
        const n = (index + 1) % tips.length;
        setIndex(n);
        window.electronStore.set(STORE_INDEX_KEY, String(n));
    };

    const dismissSession = () => {
        sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
        setHidden(true);
    };

    const dismissForever = () => {
        window.electronStore.set(STORE_DISABLED_KEY, "true");
        setHidden(true);
    };

    if (!ready || hidden) return null;

    const tip = tips[index];

    return (
        // Collapsed to a single icon so it never covers pinned links. Clicking
        // slides the tip out to the left, away from the window edge.
        <div className="absolute right-4 bottom-2 z-10 flex items-center justify-end gap-1.5">
            <div
                className={`flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-md bg-surface-menu/[0.92] backdrop-blur-sm transition-all duration-200 ease-out ${
                    open
                        ? "max-w-[560px] opacity-100 px-2.5 py-1.5"
                        : "max-w-0 opacity-0 px-0 py-1.5"
                }`}
            >
                <p className="text-[11px] text-tone-450 truncate min-w-0">{tip.title}</p>

                {tip.keys && (
                    <div className="flex items-center gap-1 shrink-0">
                        {tip.keys.map((k, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center px-1.5 py-[1px] text-[9px] rounded-md bg-fill-050 border border-line-080 text-tone-400 font-mono"
                            >
                                {k}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-0.5 shrink-0 pl-1">
                    <button
                        onClick={next}
                        className="p-1 rounded-md text-tone-300 hover:text-tone-700 hover:bg-fill-060 transition-colors"
                        title="Next tip"
                        aria-label="Next tip"
                    >
                        <ChevronRight size={12} />
                    </button>
                    <button
                        onClick={dismissSession}
                        className="p-1 rounded-md text-tone-300 hover:text-tone-700 hover:bg-fill-060 transition-colors"
                        title="Hide for this session"
                        aria-label="Hide tip"
                    >
                        <X size={11} />
                    </button>
                    <button
                        onClick={dismissForever}
                        className="p-1 rounded-md text-tone-250 hover:text-red-300/70 hover:bg-red-400/[0.06] transition-colors"
                        title="Don't show tips again"
                        aria-label="Don't show again"
                    >
                        <BellOff size={11} />
                    </button>
                </div>
            </div>

            <button
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-label={open ? "Hide tip" : "Show tip"}
                title={open ? "Hide tip" : "Show tip"}
                className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
                    open
                        ? "bg-amber-400/12 border-amber-400/25"
                        : "bg-fill-040 border-line-070 hover:bg-fill-080"
                }`}
            >
                <Lightbulb size={11} className="text-amber-300/70" strokeWidth={2} />
            </button>
        </div>
    );
}
