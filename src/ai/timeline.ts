/** One thing in a trace: a step the CLI took, or a stretch of thinking. */
export type TraceItem =
    | { kind: "step"; id: string; step: AiStep }
    | { kind: "thought"; id: string; thought: AiThought };

/** A turn in the order it happened: text, then the work between it and the next text. */
export type TimelinePart =
    | { type: "text"; key: string; text: string }
    | { type: "trace"; key: string; items: TraceItem[] };

/**
 * Cuts an answer into its text and the work done between the pieces of it.
 *
 * Steps and thinking each record how much of the answer had been written when
 * they began, so a turn that writes, searches and writes again reads in that
 * order, rather than every step pooled above an answer that was in fact
 * written around them. Chats saved before that was recorded have no `at`, and
 * read as before: the work first, then the answer.
 *
 * While an answer streams, `text` is only what has been revealed so far; work
 * that began further on waits at the end until the text catches up to it.
 */
export function buildTimeline(text: string, steps: AiStep[], thoughts: AiThought[]) {
    const ids = new Set(steps.map(s => s.id));
    const children = new Map<string, AiStep[]>();
    const items: Array<TraceItem & { at: number; seq: number }> = [];
    const clamp = (at: number | undefined) => Math.min(Math.max(at ?? 0, 0), text.length);

    steps.forEach((step, i) => {
        // A subagent's calls sit under the call that started it, rather than
        // interleaving with the parent's own work.
        if (step.parentId && ids.has(step.parentId)) {
            const list = children.get(step.parentId) ?? [];
            list.push(step);
            children.set(step.parentId, list);
            return;
        }
        items.push({ kind: "step", id: step.id, step, at: clamp(step.at), seq: step.seq ?? i });
    });
    thoughts.forEach((thought, i) => {
        if (!thought.text.trim()) return;
        items.push({ kind: "thought", id: thought.id, thought, at: clamp(thought.at), seq: thought.seq ?? i });
    });
    items.sort((a, b) => a.at - b.at || a.seq - b.seq);

    const parts: TimelinePart[] = [];
    let pos = 0;
    for (const item of items) {
        // Keyed by where it starts, so a piece of text keeps its identity
        // as it grows. Whitespace between two stretches of work is nothing.
        const between = text.slice(pos, item.at);
        if (between.trim()) parts.push({ type: "text", key: `text-${pos}`, text: between });
        pos = item.at;

        const last = parts.at(-1);
        if (last?.type === "trace") last.items.push(item);
        else parts.push({ type: "trace", key: item.id, items: [item] });
    }
    const rest = text.slice(pos);
    if (rest.trim()) parts.push({ type: "text", key: `text-${pos}`, text: rest });
    return { parts, children };
}
