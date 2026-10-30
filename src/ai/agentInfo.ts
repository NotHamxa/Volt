import { formatElapsed, formatTokens } from "@/ai/format.ts";

/** What a subagent is doing right now: its latest step still running. */
export function agentActivity(children: AiStep[] | undefined) {
    const current = [...(children ?? [])].reverse().find(s => s.status === "running");
    return current ? `${current.label}${current.detail ? ` ${current.detail}` : ""}` : "";
}

/** "12 steps · 45k tokens · 2m 10s", the figures on an agent's card and header. */
export function agentFigures(agent: AiStep, children: AiStep[] | undefined, now: number) {
    const parts: string[] = [];
    const count = Math.max((children?.length ?? 0) + (agent.hiddenSteps ?? 0), agent.toolUses ?? 0);
    if (count) parts.push(`${count} step${count === 1 ? "" : "s"}`);
    if (agent.tokens) parts.push(`${formatTokens(agent.tokens)} tokens`);
    const end = agent.endedAt ?? (agent.status === "running" ? now : undefined);
    if (agent.startedAt && end) parts.push(formatElapsed(end - agent.startedAt));
    return parts.join(" · ");
}
