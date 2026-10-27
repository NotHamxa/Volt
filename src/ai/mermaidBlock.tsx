import { useEffect, useId, useState, type ReactNode } from "react";
import { Code, Workflow } from "lucide-react";
import { CopyButton } from "@/ai/copyButton.tsx";

type Mermaid = typeof import("mermaid").default;

// Mermaid is most of a megabyte, so it's only fetched the first time an
// answer actually contains a diagram.
let loading: Promise<Mermaid> | null = null;
const loadMermaid = () => (loading ??= import("mermaid").then(m => m.default));

/** Waits out a diagram still being streamed, rather than re-drawing per token. */
const SETTLE_MS = 250;

let renders = 0;

/**
 * A ```mermaid block drawn as the diagram. Until the source parses (it's still
 * streaming, or the model wrote something Mermaid rejects) the code block
 * shows instead, so a broken diagram is never worse than before. A toggle
 * switches back to the source.
 */
export function MermaidBlock({ source, renderCode }: {
    source: string;
    /** The plain code block, with any extra buttons for its toolbar. */
    renderCode: (actions?: ReactNode) => ReactNode;
}) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const [drawn, setDrawn] = useState<{ source: string; svg: string | null } | null>(null);
    const [showSource, setShowSource] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const mermaid = await loadMermaid();
                // Checked first: a failed render leaves an error graphic in the page.
                if (!(await mermaid.parse(source, { suppressErrors: true }))) {
                    if (!cancelled) setDrawn({ source, svg: null });
                    return;
                }
                const dark = document.documentElement.classList.contains("dark");
                // "strict" runs labels through DOMPurify and turns off click
                // handlers, the diagram is model-written.
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: "strict",
                    theme: dark ? "dark" : "neutral",
                    // Flat boxes; the default look's glow read as blur at this size.
                    look: "classic",
                    fontFamily: "inherit",
                    themeVariables: { fontSize: "12px" },
                });
                const { svg } = await mermaid.render(`mermaid-${id}-${++renders}`, source);
                if (!cancelled) setDrawn({ source, svg: naturalSize(svg) });
            } catch {
                if (!cancelled) setDrawn({ source, svg: null });
            }
        }, SETTLE_MS);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [source, id]);

    // A result for an earlier version of the source doesn't count.
    const svg = drawn?.source === source ? drawn.svg : null;
    if (!svg) return renderCode();
    if (showSource) return renderCode(<ToggleButton onClick={() => setShowSource(false)} label="Show diagram" icon={<Workflow size={12} />} />);

    return (
        <div className="group/code relative my-2">
            <div
                className="mermaid-diagram p-3 rounded-lg bg-[var(--code-bg)] border border-line-070 overflow-x-auto scrollbar-thin-shadcn"
                // Mermaid's own output, sanitised by it under securityLevel strict.
                dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/code:opacity-100 focus-within:opacity-100 transition-opacity">
                <ToggleButton onClick={() => setShowSource(true)} label="Show source" icon={<Code size={12} />} />
                <CopyButton
                    label="Copy diagram source"
                    getText={() => source}
                    className="bg-fill-060 hover:bg-fill-120 border border-line-070"
                />
            </div>
        </div>
    );
}

/**
 * Mermaid sizes its SVG to fill the container, so a three-box flowchart came
 * out the width of the chat with 30px labels. Its natural width is in the
 * inline max-width; that becomes the width, and CSS only shrinks it to fit.
 */
function naturalSize(svg: string) {
    return svg.replace(/^<svg\b[^>]*>/, tag => {
        const natural = /max-width:\s*([\d.]+)px/.exec(tag)?.[1];
        if (!natural) return tag;
        return tag.replace(/\swidth="100%"/, ` width="${natural}"`).replace(/max-width:\s*[\d.]+px;?/, "");
    });
}

function ToggleButton({ onClick, label, icon }: { onClick: () => void; label: string; icon: ReactNode }) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            title={label}
            className="flex items-center justify-center w-6 h-6 rounded-md bg-fill-060 hover:bg-fill-120 border border-line-070 text-tone-500 hover:text-tone-850 transition-colors cursor-pointer"
        >
            {icon}
        </button>
    );
}
