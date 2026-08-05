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

    h1: ({ children }) => <h1 className="mt-3 first:mt-0 mb-1.5 text-[14px] font-semibold text-white/90">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-3 first:mt-0 mb-1.5 text-[13.5px] font-semibold text-white/90">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-3 first:mt-0 mb-1 text-[13px] font-semibold text-white/85">{children}</h3>,
    h4: ({ children }) => <h4 className="mt-2.5 first:mt-0 mb-1 text-[12.5px] font-semibold text-white/80">{children}</h4>,

    ul: ({ children }) => <ul className="mb-2 last:mb-0 pl-4 list-disc marker:text-white/25 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 last:mb-0 pl-4 list-decimal marker:text-white/25 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,

    strong: ({ children }) => <strong className="font-semibold text-white/95">{children}</strong>,
    em: ({ children }) => <em className="italic text-white/70">{children}</em>,
    del: ({ children }) => <del className="line-through text-white/40">{children}</del>,

    hr: () => <hr className="my-3 border-white/[0.08]" />,

    blockquote: ({ children }) => (
        <blockquote className="my-2 pl-3 border-l-2 border-white/[0.12] text-white/55">{children}</blockquote>
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
            className="text-sky-300/75 hover:text-sky-300 underline underline-offset-2 decoration-white/20 cursor-pointer"
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
                <code className="px-1 py-0.5 rounded bg-white/[0.07] border border-white/[0.06] font-mono text-[11px] text-amber-100/75 break-words">
                    {children}
                </code>
            );
        }
        return (
            <code className={`${className ?? ""} font-mono text-[11px] leading-relaxed text-white/80`} {...props}>
                {children}
            </code>
        );
    },

    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,

    // Tables are the most likely thing to exceed 800px, so the wrapper — not
    // the page — takes the horizontal scroll.
    table: ({ children }) => (
        <div className="my-2 overflow-x-auto scrollbar-thin-shadcn rounded-lg border border-white/[0.08]">
            <table className="w-full border-collapse text-[11.5px]">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
    tr: ({ children }) => <tr className="border-b border-white/[0.06] last:border-0">{children}</tr>,
    th: ({ children }) => (
        <th className="px-2.5 py-1.5 text-left font-medium text-white/70 whitespace-nowrap">{children}</th>
    ),
    td: ({ children }) => <td className="px-2.5 py-1.5 align-top text-white/65">{children}</td>,
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
                className="p-2.5 pr-9 rounded-lg bg-black/35 border border-white/[0.07] overflow-x-auto scrollbar-thin-shadcn"
            >
                {children}
            </pre>
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/code:opacity-100 focus-within:opacity-100 transition-opacity">
                <CopyButton
                    label="Copy code"
                    getText={() => ref.current?.innerText ?? ""}
                    className="bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.07]"
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
        <div className="text-[12.5px] leading-relaxed text-white/75 break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
});
