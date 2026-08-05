/**
 * Where a partly-written answer can be cut into "settled" and "still being
 * written" halves, so only the tail is re-parsed as text arrives.
 *
 * Re-parsing a whole answer per update costs ~30ms once it passes ten thousand
 * characters, against a 16ms frame budget. Splitting keeps the finished blocks
 * memoised and the repeated work proportional to the block being written.
 *
 * Returns the index just past a blank line, or -1 when there is nowhere safe.
 * Two things make a blank line unsafe to cut at:
 *
 *  - it sits inside an unclosed code fence, where a split would render the
 *    fence's contents as prose;
 *  - the block after it continues a list, which would restart the numbering
 *    at 1 until the answer finished.
 */
export function splitPoint(text: string): number {
    const LIST_ITEM = /^([-*+]\s|\d+[.)]\s)/;
    const INDENTED = /^\s+\S/;

    let from = text.length;
    while (from > 0) {
        const blank = text.lastIndexOf("\n\n", from - 1);
        if (blank <= 0) return -1;

        const head = text.slice(0, blank);
        const nextLine = text.slice(blank + 2).split("\n", 1)[0];
        const prevLine = head.slice(head.lastIndexOf("\n") + 1);

        // An odd number of fences means the split would land inside one.
        const insideFence = (head.match(/^\s*```/gm) ?? []).length % 2 !== 0;
        // Only a cut *within* a list is a problem. Cutting just before one
        // starts is fine — the tail begins the list, so it numbers from 1
        // exactly as it should.
        const midList = LIST_ITEM.test(nextLine) && (LIST_ITEM.test(prevLine) || INDENTED.test(prevLine));
        // An indented continuation belongs to the block above it.
        const continuation = INDENTED.test(nextLine);

        if (nextLine && !insideFence && !midList && !continuation) return blank + 2;
        from = blank;
    }
    return -1;
}
