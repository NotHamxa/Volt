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
        // Pinned to the bottom of the home area rather than sitting in flow —
        // in flow it pushes past its container and collides with the app footer.
        // Still a quiet line, not a raised card: the tip is ambient.
        <div className="absolute left-5 right-5 bottom-2 z-10 pointer-events-none">
            <div className="group flex items-center gap-2 px-2 py-1.5 rounded-md bg-[rgba(18,18,20,0.75)] backdrop-blur-sm select-none pointer-events-auto">
                <Lightbulb size={11} className="text-amber-300/45 shrink-0" strokeWidth={2} />

                <p className="text-[11px] text-white/35 truncate min-w-0">
                    {tip.title}
                </p>

                {tip.keys && (
                    <div className="flex items-center gap-1 shrink-0">
                        {tip.keys.map((k, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center px-1.5 py-[1px] text-[9px] rounded-md bg-white/[0.05] border border-white/[0.08] text-white/40 font-mono"
                            >
                                {k}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-0.5 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                        onClick={next}
                        className="p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
                        title="Next tip"
                        aria-label="Next tip"
                    >
                        <ChevronRight size={12} />
                    </button>
                    <button
                        onClick={dismissSession}
                        className="p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
                        title="Hide for this session"
                        aria-label="Hide tip"
                    >
                        <X size={11} />
                    </button>
                    <button
                        onClick={dismissForever}
                        className="p-1 rounded-md text-white/25 hover:text-red-300/70 hover:bg-red-400/[0.06] transition-colors"
                        title="Don't show tips again"
                        aria-label="Don't show again"
                    >
                        <BellOff size={11} />
                    </button>
                </div>
            </div>
        </div>
    );
}
