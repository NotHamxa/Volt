import { useEffect, useState, type ReactNode } from "react";
import { AppWindowIcon, Bolt, CodeXml, File, Folder, Globe, Sparkles, type LucideIcon } from "lucide-react";
import { COMMAND_TYPES, previewActions, type PreviewActionId } from "@/components/previewActions.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import type { ItemPreview } from "@/interfaces/preview.ts";
import { renderPdfFirstPage } from "@/utils/pdfPreview.ts";

// The hero area a PDF page is fitted into — taller than for other files,
// since a page is portrait and unreadable squeezed into a short box.
const PDF_BOX = { width: 330, height: 236 };

/** Result types whose details live on disk and are fetched from the main process. */
const LOOKED_UP = new Set(["app", "file", "folder"]);

// Arrowing through the list shouldn't re-ask for things just seen.
const cache = new Map<string, ItemPreview>();
const CACHE_LIMIT = 60;
const cacheKey = (item: SearchQueryT) => `${item.type}|${item.path ?? item.appId ?? item.name}`;

const KINDS: [RegExp, string][] = [
    [/^(png|jpe?g|gif|webp|bmp|svg|ico|heic|avif|tiff?)$/, "image"],
    [/^(mp4|mkv|mov|avi|webm|wmv|m4v)$/, "video"],
    [/^(mp3|wav|flac|aac|ogg|m4a|wma)$/, "audio"],
    [/^pdf$/, "document"],
    [/^docx?$/, "Word document"],
    [/^xlsx?$/, "Excel spreadsheet"],
    [/^pptx?$/, "PowerPoint presentation"],
    [/^(zip|rar|7z|tar|gz)$/, "archive"],
    [/^exe$/, "application"],
    [/^lnk$/, "shortcut"],
];

function fileKind(extension: string | undefined): string {
    if (!extension) return "File";
    const ext = extension.toUpperCase();
    const match = KINDS.find(([pattern]) => pattern.test(extension));
    if (!match) return `${ext} file`;
    // "Word document" already says what it is; "PNG image" needs the format.
    return /^[A-Z]/.test(match[1]) ? match[1] : `${ext} ${match[1]}`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} bytes`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatWhen(ms: number): string {
    const seconds = (Date.now() - ms) / 1000;
    if (seconds < 60) return "Just now";
    const steps: [number, string][] = [[60, "minute"], [24, "hour"], [7, "day"]];
    let value = seconds / 60;
    for (const [limit, unit] of steps) {
        if (value < limit) {
            const n = Math.floor(value);
            return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
        }
        value /= limit;
    }
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const SOURCES: Record<string, string> = { StartMenu: "Start menu", UWP: "Microsoft Store", Steam: "Steam" };

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] text-tone-250">{label}</span>
            <span className="text-[12px] text-tone-600 break-all">{children}</span>
        </div>
    );
}

function Excerpt({ text, truncated }: { text: string; truncated?: boolean }) {
    return (
        <pre className="text-[11px] leading-[1.45] font-mono text-tone-500 bg-fill-030 border border-line-060 rounded-lg p-2.5 whitespace-pre-wrap break-all">
            {text}
            {truncated && <span className="text-tone-250">{"\n…"}</span>}
        </pre>
    );
}

type Props = {
    item: SearchQueryT | null;
    logo?: string;
    /** The row's file-type icon, shown until the large one arrives. */
    fileIcon?: string;
    /** Highlighted action while the pane has keyboard focus, else -1. */
    activeAction: number;
    onAction: (id: PreviewActionId, item: SearchQueryT) => void;
};

/**
 * Details of the highlighted result, beside the list — the same idea as the
 * Windows search preview. Toggled with the preview shortcut (Alt+P).
 */
export default function PreviewPane({ item, logo, fileIcon, activeAction, onAction }: Props) {
    const lookedUp = !!item && LOOKED_UP.has(item.type);
    const key = item ? cacheKey(item) : "";
    const [fetched, setFetched] = useState<{ key: string; preview: ItemPreview } | null>(null);

    useEffect(() => {
        if (!item || !lookedUp || cache.has(key)) return;
        let cancelled = false;
        // Arrowing quickly through the list shouldn't generate a thumbnail
        // for every row it passes.
        const timer = setTimeout(async () => {
            const preview = await window.file.getPreview(item);
            if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
            cache.set(key, preview);
            if (!cancelled) setFetched({ key, preview });
        }, 90);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [item, key, lookedUp]);

    const preview = cache.get(key) ?? (fetched?.key === key ? fetched.preview : null);

    // PDFs have no shell thumbnail on most machines, so their first page is
    // drawn here instead. undefined while rendering, null if it can't be.
    const isPdf = item?.type === "file" && preview?.extension === "pdf" && !preview.thumbnail;
    const pdfVersion = preview?.modified ?? 0;
    const [pdfPage, setPdfPage] = useState<{ key: string; url: string | null } | null>(null);
    useEffect(() => {
        if (!isPdf || !item?.path) return;
        let cancelled = false;
        renderPdfFirstPage(item.path, PDF_BOX, pdfVersion).then(url => {
            if (!cancelled) setPdfPage({ key, url });
        });
        return () => { cancelled = true; };
    }, [isPdf, item?.path, key, pdfVersion]);
    const pdfUrl = isPdf ? (pdfPage?.key === key ? pdfPage.url : undefined) : null;

    if (!item) return <aside className="w-[44%] shrink-0 border-l border-line-070" />;

    const loading = lookedUp && !preview;
    const { type, name, path } = item;
    const isCommand = COMMAND_TYPES.has(type);

    let Icon: LucideIcon = File;
    let kindLabel = "";
    if (type === "app") { Icon = AppWindowIcon; kindLabel = "App"; }
    else if (type === "folder") { Icon = Folder; kindLabel = "Folder"; }
    else if (type === "file") { kindLabel = fileKind(preview?.extension); }
    else if (type === "setting") { Icon = Bolt; kindLabel = "Windows setting"; }
    else if (isCommand) { Icon = CodeXml; kindLabel = type.endsWith("Open") ? "Command · opens a terminal" : "Command"; }
    else if (type === "askAi") { Icon = Sparkles; kindLabel = "Ask AI"; }
    else if (type === "webSearch" || type === "webSuggestion") { Icon = Globe; kindLabel = `Web · ${item.source ?? "link"}`; }

    // A real thumbnail when Windows can draw one (images, video…), otherwise
    // the large icon of whatever opens this type — Word's, the PDF reader's.
    const artwork = (type === "file" ? preview?.thumbnail ?? pdfUrl : null) ?? null;
    const bigIcon = preview?.icon ?? (type === "app" ? logo : fileIcon) ?? null;
    const visual = artwork
        ? <img src={artwork} alt="" className={`max-w-full max-h-full object-contain ${pdfUrl ? "rounded-sm shadow-[0_2px_10px_var(--shadow-1)]" : "rounded-md"}`} />
        : bigIcon
            ? <img src={bigIcon} alt="" className="w-24 h-24 object-contain" />
            : <Icon size={48} strokeWidth={1.25} className="text-tone-300" />;

    const actions = previewActions(item);

    return (
        <aside className="w-[44%] shrink-0 border-l border-line-070 flex flex-col min-h-0">
            <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 flex flex-col gap-4">
                    <div className={`${isPdf ? "h-[260px]" : "h-[170px]"} rounded-xl border border-line-070 bg-fill-030 flex items-center justify-center p-3 overflow-hidden`}>
                        {loading
                            ? <div className="w-10 h-10 rounded-lg bg-fill-100 animate-pulse" />
                            : pdfUrl === undefined
                                ? <div className="opacity-60 animate-pulse">{visual}</div>
                                : visual}
                    </div>

                    <div className="min-w-0">
                        <div className="text-[15px] font-medium text-tone-800 break-words line-clamp-3">{name}</div>
                        {kindLabel && <div className="text-[12px] text-tone-300 mt-0.5">{kindLabel}</div>}
                    </div>

                    {actions.length > 0 && (
                        <div className="flex flex-col gap-0.5 -mx-1">
                            {actions.map(({ id, label, icon: ActionIcon }, index) => (
                                <button
                                    key={id}
                                    onClick={() => onAction(id, item)}
                                    className={`flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[12px] text-left transition-colors ${
                                        activeAction === index
                                            ? "bg-fill-100 text-tone-800 outline outline-[1px] outline-offset-[-1px] outline-ink/[0.18]"
                                            : "text-tone-600 hover:bg-fill-050"
                                    }`}
                                >
                                    <ActionIcon size={15} strokeWidth={1.75} className="shrink-0 opacity-80" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    {preview?.error && <div className="text-[12px] text-tone-400">{preview.error}</div>}

                    <div className="flex flex-col gap-2.5">
                        {type === "app" && preview?.target && <Detail label="Target">{preview.target}</Detail>}
                        {type === "app" && preview?.args && <Detail label="Arguments">{preview.args}</Detail>}
                        {type === "app" && preview?.description && <Detail label="Description">{preview.description}</Detail>}
                        {type === "app" && item.source && <Detail label="Installed from">{SOURCES[item.source] ?? item.source}</Detail>}
                        {(type === "file" || type === "folder") && path && <Detail label="Location">{path}</Detail>}
                        {preview?.size !== undefined && <Detail label="Size">{formatSize(preview.size)}</Detail>}
                        {preview?.items != null && <Detail label="Contains">{preview.items} item{preview.items === 1 ? "" : "s"}</Detail>}
                        {preview?.modified && <Detail label="Modified">{formatWhen(preview.modified)}</Detail>}
                        {preview?.created && <Detail label="Created">{formatWhen(preview.created)}</Detail>}
                        {preview?.lastUsed && <Detail label="Last opened from Volt">{formatWhen(preview.lastUsed)}</Detail>}
                        {type === "setting" && path && <Detail label="Opens">{path}</Detail>}
                        {isCommand && item.shell && item.shell !== "auto" && <Detail label="Shell">{item.shell === "cmd" ? "Command Prompt" : "PowerShell"}</Detail>}
                        {isCommand && !!item.args?.length && <Detail label="Arguments">{item.args.map(a => a.label ?? a.name).join(", ")}</Detail>}
                        {(type === "webSearch" || type === "webSuggestion") && path && <Detail label="Opens">{path}</Detail>}
                        {type === "askAi" && <Detail label="Question">Sends this to your AI provider in the AI tab.</Detail>}
                    </div>

                    {isCommand && path && <Excerpt text={path} />}
                    {preview?.excerpt && <Excerpt text={preview.excerpt.text} truncated={preview.excerpt.truncated} />}
                </div>
            </ScrollArea>
        </aside>
    );
}
