import { useEffect, useState } from "react";
import { Lightbulb, ChevronRight, X, BellOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { tips } from "@/data/tips";

const STORE_INDEX_KEY = "tipIndex";
const STORE_DISABLED_KEY = "tipsDisabled";
const SESSION_DISMISS_KEY = "voltTipDismissed";

export default function TipBar() {
    const [index, setIndex] = useState<number>(0);
    const [hidden, setHidden] = useState<boolean>(true);
    const [ready, setReady] = useState<boolean>(false);
    const navigate = useNavigate();

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
        <div className="absolute left-4 right-4 bottom-3 z-10 pointer-events-none">
            <div className="group relative flex items-start gap-3 px-3.5 py-2 rounded-lg bg-[rgba(20,20,22,0.92)] backdrop-blur-md border border-white/[0.07] shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:border-white/[0.12] transition-colors pointer-events-auto">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-400/10 border border-amber-400/15 shrink-0 mt-[1px]">
                    <Lightbulb size={11} className="text-amber-300/85" strokeWidth={2.2} />
                </div>

                <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-200/55">
                            Did you know
                        </span>
                        <span className="text-[9px] text-white/15">·</span>
                        <span className="text-[9px] uppercase tracking-[0.12em] text-white/30">{tip.category}</span>
                        {tip.keys && (
                            <div className="flex items-center gap-1 ml-1">
                                {tip.keys.map((k, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center px-1.5 py-[1px] text-[9px] rounded-md bg-white/[0.06] border border-white/10 text-white/55 font-mono"
                                    >
                                        {k}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-[12px] text-white/65 leading-snug truncate">
                        <span className="text-white/85 font-medium">{tip.title}.</span>{" "}
                        <span className="text-white/45">{tip.body}</span>
                    </p>
                </div>

                <div className="flex items-center gap-0.5 shrink-0 self-center opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => navigate("/settings")}
                        className="text-[10px] text-white/35 hover:text-white/75 transition-colors px-1.5 py-1 rounded-md hover:bg-white/[0.05]"
                        title="Browse all tips"
                    >
                        See all
                    </button>
                    <button
                        onClick={next}
                        className="p-1 rounded-md text-white/35 hover:text-white/75 hover:bg-white/[0.05] transition-colors"
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
                        className="p-1 rounded-md text-white/25 hover:text-red-300/80 hover:bg-red-400/[0.06] transition-colors"
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
