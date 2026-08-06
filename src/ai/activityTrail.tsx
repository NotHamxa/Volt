import { useEffect, useRef, useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";

/**
 * What the model is doing while it isn't answering yet.
 *
 * A turn that reads six files before writing a word used to be a spinner and
 * nothing else, which is indistinguishable from a hang. Showing the steps
 * costs no waiting and makes the same delay feel accounted for.
 *
 * It stays deliberately quiet: one line while running, collapsed to a summary
 * once the answer arrives. The reasoning itself is behind a disclosure —
 * it's long, it's not the answer, and it shouldn't compete with one.
 */
export function ActivityTrail({ reasoning, activities, running }: {
    reasoning: string;
    activities: AiActivity[];
    running: boolean;
}) {
    const [open, setOpen] = useState(false);
    const bodyRef = useRef<HTMLDivElement>(null);

    // Follow the thinking as it streams, but only while it's expanded and
    // still arriving — scrolling a box the user opened to read would fight them.
    useEffect(() => {
        if (!open || !running) return;
        const el = bodyRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [reasoning, open, running]);

    const last = activities[activities.length - 1];
    const hasReasoning = reasoning.trim().length > 0;
    if (!hasReasoning && activities.length === 0) return null;

    // Running: name the step in progress. Finished: say what it amounted to,
    // since the individual steps stop being interesting once the answer is up.
    const summary = running
        ? (last ? `${last.label}${last.detail ? ` ${last.detail}` : ""}` : "Thinking")
        : activities.length > 0
            ? `${activities.length} step${activities.length === 1 ? "" : "s"}`
            : "Thought about it";

    const expandable = hasReasoning || activities.length > 1;

    return (
        <div className="w-full min-w-0 mb-1.5">
            <button
                onClick={() => expandable && setOpen(o => !o)}
                disabled={!expandable}
                aria-expanded={expandable ? open : undefined}
                className={`flex items-center gap-1.5 max-w-full h-6 px-1.5 -ml-1.5 rounded-md text-[11px] text-tone-400 transition-colors ${
                    expandable ? "hover:text-tone-700 hover:bg-fill-050 cursor-pointer" : "cursor-default"
                }`}
            >
                {running
                    ? <Spinner className="size-3 shrink-0" />
                    : <Brain size={11} className="shrink-0 text-tone-300" />}
                <span className="truncate">{summary}</span>
                {expandable && (
                    <ChevronRight
                        size={11}
                        className={`shrink-0 text-tone-300 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                    />
                )}
            </button>

            {open && (
                <div className="mt-1 ml-1 pl-2.5 border-l border-line-080 flex flex-col gap-1.5">
                    {activities.length > 0 && (
                        <ol className="flex flex-col gap-0.5">
                            {activities.map((a, i) => (
                                <li key={i} className="flex items-baseline gap-1.5 text-[11px] min-w-0">
                                    <span className="text-tone-500 shrink-0">{a.label}</span>
                                    {a.detail && (
                                        <span className="text-tone-350 font-mono text-[10px] truncate">{a.detail}</span>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                    {hasReasoning && (
                        <div
                            ref={bodyRef}
                            className="max-h-44 overflow-y-auto scrollbar-thin-shadcn text-[11px] leading-relaxed text-tone-400 whitespace-pre-wrap"
                        >
                            {reasoning}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
