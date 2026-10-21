import { CSSProperties, useCallback, useEffect, useState } from "react";

/**
 * Fades whichever edge of a scrolling box has more beyond it, so a list
 * that scrolls says so without a scrollbar having to. `axis` picks top and
 * bottom, or left and right.
 *
 * `attach` is a callback ref: the box can mount later than the component using
 * it (a grid that only appears once something is pinned) and is picked up
 * whenever it does. Re-measured on scroll, and whenever the box or its
 * contents change.
 */
export function useEdgeFade<T extends HTMLElement>(axis: "x" | "y" = "y") {
    const [el, attach] = useState<T | null>(null);
    const [more, setMore] = useState({ start: false, end: false });

    const measure = useCallback(() => {
        if (!el) return;
        const [pos, size, total] = axis === "y"
            ? [el.scrollTop, el.clientHeight, el.scrollHeight]
            : [el.scrollLeft, el.clientWidth, el.scrollWidth];
        const start = pos > 2;
        const end = pos + size < total - 2;
        setMore(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
    }, [el, axis]);

    useEffect(() => {
        if (!el) return;
        const resize = new ResizeObserver(measure);
        resize.observe(el);
        // The contents can grow without the box changing size.
        const children = new MutationObserver(measure);
        children.observe(el, { childList: true });
        // No measure() here: a ResizeObserver reports once as it starts.
        return () => { resize.disconnect(); children.disconnect(); };
    }, [el, measure]);

    const dir = axis === "y" ? "to bottom" : "to right";
    const mask = more.start && more.end
        ? `linear-gradient(${dir}, transparent, black 22px, black calc(100% - 22px), transparent)`
        : more.end
            ? `linear-gradient(${dir}, black calc(100% - 22px), transparent)`
            : more.start
                ? `linear-gradient(${dir}, transparent, black 22px)`
                : undefined;
    const style: CSSProperties | undefined = mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined;

    return { attach, onScroll: measure, style };
}
