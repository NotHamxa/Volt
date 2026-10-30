export function formatDuration(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(1)}s`;
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatTokens(n: number | undefined): string {
    if (!n) return "0";
    if (n < 1000) return String(n);
    // One decimal while it still means something: 34.3k, but 120k.
    if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Whole seconds, for a clock that ticks: 7s, 4m 50s, 1h 02m. */
export function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    if (total < 60) return `${total}s`;
    const m = Math.floor(total / 60);
    if (m < 60) return `${m}m ${total % 60}s`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** What went up to the model and came back: ↑ 12k · ↓ 34.3k tokens. */
export function tokenFlow(input: number | undefined, output: number | undefined): string {
    const parts: string[] = [];
    if (input) parts.push(`↑ ${formatTokens(input)}`);
    if (output) parts.push(`↓ ${formatTokens(output)}`);
    return parts.length ? `${parts.join(" · ")} tokens` : "";
}
