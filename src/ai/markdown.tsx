import { memo, useRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { CopyButton } from "@/ai/copyButton.tsx";
import { splitPoint } from "@/ai/streamSplit.ts";

/**
 * Renders an assistant turn as markdown.
 *
 * Raw HTML is deliberately not enabled (no rehype-raw). This is a renderer with
 * a preload bridge attached, so injecting model-authored HTML would be an XSS
 * surface; react-markdown escapes it by default and that stays true here.
 *
 * remark-breaks is on because this is a chat, not a document. CommonMark treats
 * a single newline as a soft break and renders it as a space, so an answer like
 * a list of numbers one per line collapsed onto one line. Inside fenced code
 * newlines are literal already, so nothing there changes.
 *
 * Sized for an 800px launcher window rather than a document: tight leading,
 * small type, and anything that can outgrow the width scrolls in its own box.
 */

const components: Components = {
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

    h1: ({ children }) => <h1 className="mt-3 first:mt-0 mb-1.5 text-[14px] font-semibold text-ink/90">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-3 first:mt-0 mb-1.5 text-[13.5px] font-semibold text-ink/90">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-3 first:mt-0 mb-1 text-[13px] font-semibold text-ink/85">{children}</h3>,
    h4: ({ children }) => <h4 className="mt-2.5 first:mt-0 mb-1 text-[12.5px] font-semibold text-ink/80">{children}</h4>,

    ul: ({ children }) => <ul className="mb-2 last:mb-0 pl-4 list-disc marker:text-ink/25 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 last:mb-0 pl-4 list-decimal marker:text-ink/25 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,

    strong: ({ children }) => <strong className="font-semibold text-ink/95">{children}</strong>,
    em: ({ children }) => <em className="italic text-ink/70">{children}</em>,
    del: ({ children }) => <del className="line-through text-ink/40">{children}</del>,

    hr: () => <hr className="my-3 border-line-080" />,

    blockquote: ({ children }) => (
        <blockquote className="my-2 pl-3 border-l-2 border-line-120 text-ink/55">{children}</blockquote>
    ),

    // Links open in the real browser. The main process blocks in-window
    // navigation anyway, so without this a click would simply do nothing.
    a: ({ href, children }) => (
        <a
            href={href}
            onClick={(e) => {
                e.preventDefault();
                if (href) window.electron.openExternal(href);
            }}
            className="text-sky-300/75 hover:text-sky-300 underline underline-offset-2 decoration-ink/20 cursor-pointer"
        >
            {children}
        </a>
    ),

    code: ({ className, children, ...props }) => {
        // react-markdown marks fenced blocks with a language- class; anything
        // without one is an inline span.
        const isBlock = /language-/.test(className ?? "");
        if (!isBlock) {
            return (
                <code className="px-1 py-0.5 rounded bg-fill-070 border border-line-060 font-mono text-[11px] text-amber-100/75 break-words">
                    {children}
                </code>
            );
        }
        return (
            <code className={`${className ?? ""} font-mono text-[11px] leading-relaxed text-ink/80`} {...props}>
                {children}
            </code>
        );
    },

    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,

    // Tables are the most likely thing to exceed 800px, so the wrapper — not
    // the page — takes the horizontal scroll.
    table: ({ children }) => (
        <div className="my-2 overflow-x-auto scrollbar-thin-shadcn rounded-lg border border-line-080">
            {/* min-w-full, not w-full: w-full pinned the table to the wrapper so
                it could never overflow, which made the scroll container
                decorative and crushed wide tables into the available space. */}
            <table className="min-w-full border-collapse text-[11.5px]">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-fill-050">{children}</thead>,
    tr: ({ children }) => <tr className="border-b border-line-050 last:border-0">{children}</tr>,

    // `style` carries the column alignment GFM declares in its delimiter row
    // (`|---:|`). Dropping it, as these did, silently ignored every alignment
    // an answer asked for. The inline value also beats the default class below.
    th: ({ children, style }) => (
        <th
            style={style}
            className="px-3 py-2 text-left font-medium text-ink/75 whitespace-nowrap border-b border-line-100 border-r border-line-050 last:border-r-0"
        >
            {children}
        </th>
    ),
    td: ({ children, style }) => (
        <td
            style={style}
            className="px-3 py-1.5 align-top text-ink/65 border-r border-line-040 last:border-r-0"
        >
            {children}
        </td>
    ),
};

/**
 * A fenced block with its own copy button.
 *
 * The text is read off the rendered DOM rather than reassembled from React
 * children — children are a nested tree of elements, and flattening them back
 * to source drops newlines. The DOM already holds exactly what's on screen.
 */
function CodeBlock({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLPreElement>(null);

    return (
        <div className="group/code relative my-2">
            <pre
                ref={ref}
                className="p-2.5 pr-9 rounded-lg bg-[var(--code-bg)] border border-line-070 overflow-x-auto scrollbar-thin-shadcn"
            >
                {children}
            </pre>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/code:opacity-100 focus-within:opacity-100 transition-opacity">
                <CopyButton
                    label="Copy code"
                    getText={() => ref.current?.innerText ?? ""}
                    className="bg-fill-060 hover:bg-fill-120 border border-line-070"
                />
            </div>
        </div>
    );
}

/**
 * A streaming answer, split so the finished blocks are parsed once and only the
 * block currently being written is re-parsed per frame.
 *
 * Without this, every frame re-parsed the entire answer: measured at ~30ms for
 * a long reply, against a 16ms frame budget, which is what made streaming feel
 * like it was dragging.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({ children }: { children: string }) {
    const at = splitPoint(children);
    if (at === -1) return <Markdown>{children}</Markdown>;
    return (
        <>
            {/* Memoised on its own text, so it re-parses only when a block completes. */}
            <Markdown>{children.slice(0, at)}</Markdown>
            <Markdown>{children.slice(at)}</Markdown>
        </>
    );
});

/**
 * Memoised on the text: during a stream every token re-renders the transcript,
 * and re-parsing every completed message each time is wasted work.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
    return (
        <div className="text-[12.5px] leading-relaxed text-ink/75 break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
});
