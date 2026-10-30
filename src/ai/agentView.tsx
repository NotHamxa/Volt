import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useEscape } from "@/hooks/useEscape.ts";
import { Markdown } from "@/ai/markdown.tsx";
import { buildTimeline } from "@/ai/timeline.ts";
import { TurnTrace, AgentStatus, StepText } from "@/ai/turnTrace.tsx";
import { agentActivity, agentFigures } from "@/ai/agentInfo.ts";

/** Every step under an agent, its subagents' included, in the order they came. */
function descendantsOf(id: string, steps: AiStep[]) {
    const ids = new Set([id]);
    const found: AiStep[] = [];
    for (const step of steps) {
        if (step.parentId && ids.has(step.parentId)) {
            ids.add(step.id);
            found.push(step);
        }
    }
    return found;
}

/**
 * One subagent on its own: what it was asked, the work it did, and what it
 * wrote, laid out like an answer. The agents beside it are a click away along
 * the top, and the conversation is one Back (or Escape) away.
 *
 * Drawn over the chat rather than in place of it, so going back lands where
 * you left off instead of at the top.
 */
export function AgentView({ agentId, steps, agentText, live, bottomInset, onOpen, onBack }: {
    agentId: string;
    /** All of the turn's steps; the agent and its siblings are found in them. */
    steps: AiStep[];
    agentText: Record<string, string>;
    /** The turn is still running, so a running agent is still at work. */
    live: boolean;
    /** Room left under the content for the floating prompt box. */
    bottomInset: number;
    onOpen: (id: string) => void;
    onBack: () => void;
}) {
    useEscape(onBack, true);
    const [showPrompt, setShowPrompt] = useState(false);

    const agent = steps.find(s => s.id === agentId);
    // The agents started alongside this one, to hop between.
    const siblings = useMemo(() => agent
        ? steps.filter(s => s.kind === "agent" && s.parentId === agent.parentId)
        : [], [steps, agent]);
    const parent = agent?.parentId ? steps.find(s => s.id === agent.parentId) : undefined;

    const text = (agent && agentText[agent.id]) ?? "";
    const descendants = useMemo(() => descendantsOf(agentId, steps), [agentId, steps]);
    const { parts, children } = useMemo(() => buildTimeline(text, descendants, []), [text, descendants]);
    const own = useMemo(() => descendants.filter(s => s.parentId === agentId), [descendants, agentId]);

    const [now, setNow] = useState(() => Date.now());
    const working = live && agent?.status === "running";
    useEffect(() => {
        if (!working) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [working]);

    const firstTrace = parts.findIndex(p => p.type === "trace");

    return (
        <div className="absolute inset-0 z-20 flex flex-col animate-in fade-in duration-150">
            {/* Back, then every agent this one was started with. */}
            <div className="shrink-0 flex items-center gap-1.5 px-4 pt-3 pb-2 border-b border-line-060">
                <button
                    onClick={onBack}
                    title={parent ? "Back to the agent that started this one (Esc)" : "Back to the chat (Esc)"}
                    className="shrink-0 flex items-center gap-1 h-6 px-1.5 -ml-1.5 rounded-md text-11 text-tone-450 hover:text-tone-800 hover:bg-fill-050 transition-colors cursor-pointer"
                >
                    <ArrowLeft size={12} />
                    {parent ? (parent.detail || "Agent") : "Chat"}
                </button>
                {siblings.length > 1 && (
                    <div className="flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
                        {siblings.map(s => (
                            <button
                                key={s.id}
                                onClick={() => onOpen(s.id)}
                                aria-current={s.id === agentId ? "page" : undefined}
                                title={s.detail}
                                className={`shrink-0 flex items-center gap-1.5 h-6 px-2 rounded-full border text-10.5 transition-colors cursor-pointer ${s.id === agentId
                                    ? "border-line-120 bg-fill-080 text-tone-850"
                                    : "border-line-060 text-tone-400 hover:text-tone-750 hover:bg-fill-050"}`}
                            >
                                <AgentStatus status={live || s.status !== "running" ? s.status : "stopped"} className="size-2.5!" />
                                <span className="max-w-40 truncate">{s.detail || "Agent"}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {!agent ? (
                <p className="px-4 pt-4 text-11.5 text-tone-350">This agent's work wasn't kept.</p>
            ) : (
                <ScrollArea className="flex-1 min-h-0 w-full px-4">
                    <div className="flex flex-col gap-3 pt-3" style={{ paddingBottom: bottomInset + 16 }}>
                        <div className="flex items-start gap-2.5 min-w-0">
                            <Bot size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-tone-350" />
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="text-12.5 text-tone-850">{agent.detail || "Agent"}</span>
                                <span className="flex items-center gap-1.5 text-10 tabular-nums text-tone-300">
                                    <AgentStatus status={working || agent.status !== "running" ? agent.status : "stopped"} className="size-2.5!" />
                                    {[
                                        working ? "Working" : agent.status === "failed" ? "Failed" : agent.status === "running" || agent.status === "stopped" ? "Stopped" : "Done",
                                        agentFigures(agent, own, now),
                                    ].filter(Boolean).join(" · ")}
                                </span>
                            </div>
                        </div>

                        {agent.input?.trim() && (
                            <div className="flex flex-col gap-1">
                                <button
                                    onClick={() => setShowPrompt(v => !v)}
                                    aria-expanded={showPrompt}
                                    className="flex items-center gap-1 w-fit text-10.5 text-tone-400 hover:text-tone-750 transition-colors cursor-pointer"
                                >
                                    <ChevronRight size={11} className={`transition-transform duration-150 ${showPrompt ? "rotate-90" : ""}`} />
                                    What it was asked
                                </button>
                                {showPrompt && <StepText text={agent.input} />}
                            </div>
                        )}

                        <div className="min-w-0">
                            {parts.map((part, p) => part.type === "trace" ? (
                                <TurnTrace
                                    key={part.key}
                                    items={part.items}
                                    childSteps={children}
                                    hiddenSteps={p === firstTrace ? agent.hiddenSteps : 0}
                                    running={working && p === parts.length - 1}
                                    onOpenAgent={onOpen}
                                />
                            ) : (
                                <Markdown key={part.key}>{part.text}</Markdown>
                            ))}
                            {/* An agent that ran in the foreground hands its
                                report back as its result; show it when the
                                agent's own words weren't kept. */}
                            {!text.trim() && agent.output?.trim() && agent.status !== "running" && (
                                <Markdown>{agent.output}</Markdown>
                            )}
                            {working && (
                                <span className="flex items-center gap-1.5 mt-1.5 text-11 text-tone-350">
                                    <Spinner className="size-3" />
                                    <span className="truncate">{agentActivity(own) || "Working…"}</span>
                                </span>
                            )}
                            {!working && parts.length === 0 && !agent.output?.trim() && (
                                <p className="text-11 text-tone-300">Nothing was recorded for this agent.</p>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}
