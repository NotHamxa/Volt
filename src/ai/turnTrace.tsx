import { useEffect, useMemo, useRef, useState } from "react";
import {
    Bot, Brain, Check, ChevronRight, Circle, CircleDot, FilePen, FileText, Globe, ListChecks, LucideIcon,
    Search, SquareTerminal, Wrench, X,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import type { TraceItem } from "@/ai/timeline.ts";

/**
 * How an answer was reached: the steps a CLI took, the plan it kept, and what
 * it was thinking.
 *
 * A turn that reads six files before writing a word used to be a spinner and
 * nothing else, which is indistinguishable from a hang. Then it was a list of
 * verbs, which at least moved, but a command that failed looked exactly like
 * one that worked, and nothing said what it printed. Each step now carries its
 * outcome, how long it took, and its output a click away.
 *
 * The work sits where it happened: a turn that writes, searches and writes
 * again shows the search between the two pieces of text, not above both.
 *
 * It stays quiet by default: while running, the header names the step in
 * progress and the last few steps trail beneath it; once the answer is in, it
 * folds to a one-line summary.
 */

const KIND_ICON: Record<AiStepKind, LucideIcon> = {
    command: SquareTerminal,
    read: FileText,
    write: FilePen,
    search: Search,
    web: Globe,
    agent: Bot,
    tool: Wrench,
};

/** Labels arrive in the present tense; a finished step reads as done. */
const PAST: Record<string, string> = {
    "Running": "Ran",
    "Reading": "Read",
    "Reading output": "Read output",
    "Writing": "Wrote",
    "Editing": "Edited",
    "Searching": "Searched",
    "Finding files": "Found files",
    "Searching the web": "Searched the web",
    "Fetching": "Fetched",
    "Delegating": "Delegated",
    "Using": "Used",
    "Using skill": "Used skill",
    "Stopping a command": "Stopped a command",
    "Retrying": "Retried",
};

/** Steps shown under the header while a turn runs and the trace is folded. */
const LIVE_TAIL = 3;

function formatDuration(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(1)}s`;
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatTokens(n: number | undefined): string {
    if (!n) return "0";
    if (n < 1000) return String(n);
    if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
    if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
    return `${(n / 1_000_000).toFixed(1)}M`;
}

const WINDOW_LABEL: Record<string, string> = {
    five_hour: "5-hour",
    seven_day: "weekly",
    seven_day_opus: "weekly Opus",
    seven_day_sonnet: "weekly Sonnet",
};

/** A clock for running steps, ticking only while something is running. */
function useNow(active: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [active]);
    return now;
}

/**
 * The work done between two pieces of an answer.
 *
 * `running` is for the stretch the turn is in now. An earlier one can still
 * have a step going, Claude runs some in parallel, and shows it as busy
 * until that settles.
 */
export function TurnTrace({ items, childSteps, hiddenSteps = 0, plan, running }: {
    items: TraceItem[];
    childSteps: Map<string, AiStep[]>;
    hiddenSteps?: number;
    plan?: AiPlanItem[] | null;
    running: boolean;
}) {
    const [open, setOpen] = useState(false);

    const steps = useMemo(() => items.flatMap(item =>
        item.kind === "step" ? [item.step, ...(childSteps.get(item.step.id) ?? [])] : []), [items, childSteps]);
    const thinking = running && items.at(-1)?.kind === "thought";
    const now = useNow(thinking || steps.some(s => s.status === "running"));

    const planItems = plan ?? [];
    if (items.length === 0 && planItems.length === 0) return null;

    const failed = steps.filter(s => s.status === "failed").length;
    const total = steps.length + hiddenSteps;
    // Between steps nothing is running, and naming the last one, which may
    // have failed, beside a spinner would say it is still going.
    const current = [...steps].reverse().find(s => s.status === "running");
    const busy = running || Boolean(current);
    const doing = planItems.find(p => p.status === "in_progress");
    const planDone = planItems.filter(p => p.status === "completed").length;

    // Running: say what is happening now. Finished: what it amounted to,
    // since the individual steps stop being interesting once the answer is up.
    let summary: string;
    if (busy) {
        summary = current
            ? `${current.label}${current.detail ? ` ${current.detail}` : ""}`
            : thinking ? "Thinking" : doing?.active ?? doing?.text ?? "Thinking";
    } else if (total > 0) {
        summary = `${total} step${total === 1 ? "" : "s"}`;
    } else if (items.length > 0) {
        const thoughtMs = items.reduce((sum, item) =>
            item.kind === "thought" && item.thought.startedAt && item.thought.endedAt
                ? sum + item.thought.endedAt - item.thought.startedAt
                : sum, 0);
        summary = thoughtMs >= 1000 ? `Thought for ${formatDuration(thoughtMs)}` : "Thought about it";
    } else {
        summary = "Planned";
    }

    const tail = !open && busy ? items.slice(-LIVE_TAIL) : [];

    return (
        <div className="w-full min-w-0 my-1.5 first:mt-0 last:mb-0">
            <button
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="flex items-center gap-1.5 max-w-full h-6 px-1.5 -ml-1.5 rounded-md text-11 text-tone-400 hover:text-tone-700 hover:bg-fill-050 transition-colors cursor-pointer"
            >
                {busy
                    ? <Spinner className="size-3 shrink-0" />
                    : total > 0
                        ? <ListChecks size={12} className="shrink-0 text-tone-300" />
                        : <Brain size={11} className="shrink-0 text-tone-300" />}
                <span className="truncate">{summary}</span>
                {!busy && failed > 0 && (
                    <span className="shrink-0 text-red-300/80">· {failed} failed</span>
                )}
                {planItems.length > 0 && (
                    <span className="shrink-0 px-1 rounded bg-fill-060 text-10 text-tone-450 tabular-nums">
                        {planDone}/{planItems.length}
                    </span>
                )}
                <ChevronRight
                    size={11}
                    className={`shrink-0 text-tone-300 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                />
            </button>

            {tail.length > 0 && (
                <ol className="mt-0.5 ml-1 pl-2.5 border-l border-line-080 flex flex-col">
                    {items.length > LIVE_TAIL && (
                        <li className="text-10 text-tone-250 py-0.5">{items.length - LIVE_TAIL} earlier</li>
                    )}
                    {tail.map(item => item.kind === "step"
                        ? <StepRow key={item.id} step={item.step} now={now} />
                        : <ThoughtRow key={item.id} thought={item.thought} now={now} />)}
                </ol>
            )}

            {open && (
                <div className="mt-1 ml-1 pl-2.5 border-l border-line-080 flex flex-col gap-1">
                    {planItems.length > 0 && <PlanList items={planItems} />}
                    {items.length > 0 && (
                        <ol className="flex flex-col">
                            {hiddenSteps > 0 && (
                                <li className="text-10 text-tone-250 py-0.5">{hiddenSteps} earlier steps not kept</li>
                            )}
                            {items.map((item, i) => (
                                <li key={item.id} className="flex flex-col">
                                    {item.kind === "thought" ? (
                                        <Reasoning thought={item.thought} now={now} running={thinking && i === items.length - 1} />
                                    ) : (
                                        <>
                                            <StepRow step={item.step} now={now} bare />
                                            {childSteps.has(item.id) && (
                                                <ol className="ml-1.5 pl-2.5 border-l border-line-060 flex flex-col">
                                                    {childSteps.get(item.id)!.map(child => <StepRow key={child.id} step={child} now={now} />)}
                                                </ol>
                                            )}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
}

/** "Thinking 4s" while it runs, "Thought 12s" after; older chats kept no times. */
function thoughtLabel(thought: AiThought, now: number) {
    if (!thought.startedAt) return { label: "Thought", duration: "" };
    return {
        label: thought.endedAt ? "Thought" : "Thinking",
        duration: formatDuration((thought.endedAt ?? now) - thought.startedAt),
    };
}

/** Thinking as a line in the folded trail: that it is happening, and for how long. */
function ThoughtRow({ thought, now }: { thought: AiThought; now: number }) {
    const { label, duration } = thoughtLabel(thought, now);
    return (
        <li className="flex items-center gap-1.5 py-0.5 text-11">
            <Brain size={11} strokeWidth={1.8} className="shrink-0 text-tone-300" />
            <span className="text-tone-500">{label}</span>
            <span className="ml-auto pl-2 shrink-0 flex items-center gap-1 text-10 tabular-nums text-tone-250">
                {thought.startedAt && !thought.endedAt && <Spinner className="size-2.5" />}
                {duration}
            </span>
        </li>
    );
}

/**
 * One step: what it did, how it ended, how long it took. Output is behind a
 * click, useful when something went wrong, noise when it didn't.
 */
function StepRow({ step, now, bare = false }: { step: AiStep; now: number; bare?: boolean }) {
    const [showOutput, setShowOutput] = useState(false);
    const Icon = KIND_ICON[step.kind ?? "tool"] ?? Wrench;
    const hasOutput = Boolean(step.output?.trim());
    // A running step counts up against the ticking clock.
    const end = step.endedAt ?? (step.status === "running" ? now : undefined);
    const duration = step.startedAt && end ? formatDuration(end - step.startedAt) : "";

    const row = (
        <>
            <button
                onClick={() => hasOutput && setShowOutput(v => !v)}
                disabled={!hasOutput}
                aria-expanded={hasOutput ? showOutput : undefined}
                className={`group/step flex items-center gap-1.5 w-full min-w-0 py-0.5 text-left text-11 ${hasOutput ? "cursor-pointer" : "cursor-default"}`}
            >
                <Icon size={11} strokeWidth={1.8} className={`shrink-0 ${step.status === "failed" ? "text-red-300/70" : "text-tone-300"}`} />
                <span className={`shrink-0 ${step.status === "failed" ? "text-red-300/85" : "text-tone-500"} ${hasOutput ? "group-hover/step:text-tone-800" : ""}`}>
                    {step.status === "running" ? step.label : PAST[step.label] ?? step.label}
                </span>
                {step.detail && <span className="min-w-0 truncate font-mono text-10 text-tone-350">{step.detail}</span>}
                <span className="ml-auto pl-2 shrink-0 flex items-center gap-1 text-10 tabular-nums text-tone-250">
                    {step.status === "running" && <Spinner className="size-2.5" />}
                    {step.status === "failed" && (
                        <span className="flex items-center gap-0.5 text-red-300/80">
                            <X size={10} /> {step.exitCode !== undefined ? `exit ${step.exitCode}` : "failed"}
                        </span>
                    )}
                    {step.status === "stopped" && <span>stopped</span>}
                    {duration}
                </span>
            </button>
            {showOutput && hasOutput && (
                <pre className="mb-1 max-h-40 overflow-auto scrollbar-thin-shadcn px-2 py-1.5 rounded-md bg-[var(--code-bg)] border border-line-070 font-mono text-10 leading-relaxed text-tone-600 whitespace-pre-wrap break-all">
                    {step.output}
                </pre>
            )}
        </>
    );
    return bare ? row : <li className="flex flex-col">{row}</li>;
}

function PlanList({ items }: { items: AiPlanItem[] }) {
    return (
        <ol className="flex flex-col gap-0.5 py-0.5">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-11 min-w-0">
                    {item.status === "completed"
                        ? <Check size={11} className="mt-0.5 shrink-0 text-emerald-400/70" />
                        : item.status === "in_progress"
                            ? <CircleDot size={11} className="mt-0.5 shrink-0 text-amber-300/80" />
                            : <Circle size={11} className="mt-0.5 shrink-0 text-tone-250" />}
                    <span className={
                        item.status === "completed" ? "text-tone-350 line-through decoration-tone-250"
                            : item.status === "in_progress" ? "text-tone-750" : "text-tone-450"
                    }>
                        {item.status === "in_progress" ? item.active ?? item.text : item.text}
                    </span>
                </li>
            ))}
        </ol>
    );
}

/** The model's thinking, followed as it streams unless you've scrolled up to read. */
function Reasoning({ thought, now, running }: { thought: AiThought; now: number; running: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!running || !el) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight;
    }, [thought.text, running]);
    const { label, duration } = thoughtLabel(thought, now);
    return (
        <div className="flex flex-col gap-0.5 py-0.5">
            <span className="flex items-center gap-1.5 text-11 text-tone-500">
                <Brain size={11} strokeWidth={1.8} className="shrink-0 text-tone-300" />
                {label}
                {duration && <span className="ml-auto pl-2 text-10 tabular-nums text-tone-250">{duration}</span>}
            </span>
            <div
                ref={ref}
                className="ml-4 max-h-44 overflow-y-auto scrollbar-thin-shadcn text-11 leading-relaxed text-tone-400 whitespace-pre-wrap"
            >
                {thought.text}
            </div>
        </div>
    );
}

/**
 * The figures behind an answer, in one quiet line: which model actually ran
 * (an alias like "default" says nothing), how long it took, what it read and
 * wrote, and, on a subscription, how much of the plan's window is gone.
 */
export function TurnStats({ stats, showCost }: { stats: AiTurnStats; showCost: boolean }) {
    const parts: string[] = [];
    if (stats.model) parts.push(stats.model.replace(/-\d{8}$/, ""));
    const duration = formatDuration(stats.durationMs);
    if (duration) parts.push(duration);
    if (stats.inputTokens || stats.outputTokens) {
        parts.push(`${formatTokens(stats.inputTokens)} in · ${formatTokens(stats.outputTokens)} out`);
    }
    if (showCost && typeof stats.costUsd === "number" && stats.costUsd > 0) {
        parts.push(`$${stats.costUsd < 0.01 ? stats.costUsd.toFixed(4) : stats.costUsd.toFixed(2)}`);
    }
    if (stats.limit) {
        const label = WINDOW_LABEL[stats.limit.window] ?? stats.limit.window.replace(/_/g, " ");
        parts.push(`${Math.round(stats.limit.utilization * 100)}% of ${label} limit`);
    }
    if (parts.length === 0) return null;
    return (
        <span className="text-10 text-tone-250 tabular-nums truncate" title={parts.join(" · ")}>
            {parts.join(" · ")}
        </span>
    );
}
