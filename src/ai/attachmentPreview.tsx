import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, ImageOff, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape.ts";
import { Spinner } from "@/components/ui/spinner.tsx";

type Preview = { url: string; width: number | null; height: number | null };

/** Longest side of a thumbnail, at twice its drawn size for sharp edges. */
const THUMB_SIZE = 480;
/** Longest side in the full-size preview, beyond the window, so never soft. */
const FULL_SIZE = 2400;

// Each image is read once per size for the session, however often the chat
// re-renders or is reopened.
const cache = new Map<string, Promise<Preview | null>>();

function loadImage(chatId: string, path: string, size: number) {
    const key = `${chatId}|${path}|${size}`;
    let pending = cache.get(key);
    if (!pending) {
        pending = window.ai.attachmentImage(chatId, path, size).catch(() => null);
        cache.set(key, pending);
    }
    return pending;
}

/** An attached image, read through the main process. `undefined` while loading. */
function useAttachmentImage(chatId: string | undefined, path: string, size: number) {
    const [loaded, setLoaded] = useState<{ key: string; preview: Preview | null } | null>(null);
    const key = `${chatId}|${path}|${size}`;
    useEffect(() => {
        if (!chatId) return;
        let cancelled = false;
        loadImage(chatId, path, size).then(preview => {
            if (!cancelled) setLoaded({ key, preview });
        });
        return () => { cancelled = true; };
    }, [chatId, path, size, key]);
    // A result for another image (the tile was reused) doesn't count.
    return loaded?.key === key ? loaded.preview : undefined;
}

/**
 * An image sent with a message, shown as the picture itself. Clicking it
 * opens it full size inside Volt; a file moved or deleted since says so.
 */
export function SentImage({ chatId, attachment }: { chatId: string | undefined; attachment: AiAttachment }) {
    const thumb = useAttachmentImage(chatId, attachment.path, THUMB_SIZE);
    const [open, setOpen] = useState(false);

    if (thumb === null) {
        return (
            <div title={`${attachment.name} (moved or deleted)`} className="flex items-center gap-1.5 h-10 px-2.5 rounded-lg border border-line-080 bg-fill-040 text-10.5 text-tone-300">
                <ImageOff size={12} /> <span className="max-w-32 truncate">{attachment.name}</span>
            </div>
        );
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title={attachment.name}
                aria-label={`View ${attachment.name}`}
                className="block overflow-hidden rounded-xl border border-line-080 bg-fill-040 hover:border-ink/[0.2] transition-colors cursor-zoom-in"
            >
                {thumb ? (
                    <img src={thumb.url} alt={attachment.name} className="block max-h-40 max-w-60 min-w-10 min-h-10 object-contain" />
                ) : (
                    <span className="block w-24 h-24 animate-pulse bg-fill-060" />
                )}
            </button>
            {open && chatId && (
                <ImageViewer
                    name={attachment.name}
                    placeholder={thumb?.url}
                    load={() => loadImage(chatId, attachment.path, FULL_SIZE)}
                    onOpenExternal={() => window.ai.openAttachment(chatId, attachment.path)}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

/**
 * A pasted or picked image still in the composer: its thumbnail, removable.
 * A shimmer holds its place until the picture is decoded (and, for a paste,
 * read in), a large screenshot otherwise popped in a beat after the paste.
 */
export function PendingImage({ name, src, loading, onRemove }: {
    name: string;
    src: string;
    loading?: boolean;
    onRemove: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [decoded, setDecoded] = useState(false);
    const busy = loading || !decoded;
    return (
        <div className="group/img relative">
            <button
                onClick={() => setOpen(true)}
                title={loading ? `${name} (attaching…)` : name}
                aria-label={`View ${name}`}
                aria-busy={busy}
                className="relative block w-14 h-14 overflow-hidden rounded-lg border border-line-080 bg-fill-040 cursor-zoom-in"
            >
                <img
                    src={src}
                    alt={name}
                    onLoad={() => setDecoded(true)}
                    onError={() => setDecoded(true)}
                    className={`w-full h-full object-cover transition-opacity duration-200 ${decoded ? "opacity-100" : "opacity-0"}`}
                />
                {busy && (
                    <span className="absolute inset-0 flex items-center justify-center bg-fill-060 animate-pulse">
                        <Spinner className="size-3.5 text-tone-450" />
                    </span>
                )}
            </button>
            <button
                onClick={onRemove}
                aria-label={`Remove ${name}`}
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4.5 h-4.5 rounded-full bg-surface-float border border-line-120 text-tone-500 hover:text-tone-900 shadow-sm opacity-0 group-hover/img:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
            >
                <X size={10} />
            </button>
            {open && <ImageViewer name={name} placeholder={src} onClose={() => setOpen(false)} />}
        </div>
    );
}

/**
 * The image at full size over the whole window. Shows the thumbnail scaled up
 * at once, then swaps in the full-resolution copy when it arrives. Escape, a
 * click outside the picture, or the close button dismisses it.
 */
export function ImageViewer({ name, placeholder, load, onOpenExternal, onClose }: {
    name: string;
    placeholder?: string;
    load?: () => Promise<Preview | null>;
    onOpenExternal?: () => void;
    onClose: () => void;
}) {
    const [full, setFull] = useState<Preview | null>(null);
    const close = useCallback(() => onClose(), [onClose]);
    // Held so Escape closes this rather than leaving the AI view.
    useEscape(close, true);

    useEffect(() => {
        if (!load) return;
        let cancelled = false;
        load().then(preview => { if (!cancelled) setFull(preview); });
        return () => { cancelled = true; };
    }, [load]);

    const src = full?.url ?? placeholder;
    const size = full?.width && full?.height ? `${full.width} × ${full.height}` : null;

    return createPortal(
        <div
            role="dialog"
            aria-label={name}
            onClick={close}
            className="fixed inset-0 z-[70] flex flex-col bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
            <div className="flex items-center gap-3 px-4 py-2.5" onClick={e => e.stopPropagation()}>
                <p className="min-w-0 flex-1 truncate text-12 text-white/85">
                    {name}
                    {size && <span className="ml-2 text-10.5 text-white/40 tabular-nums">{size}</span>}
                </p>
                {onOpenExternal && (
                    <button
                        onClick={onOpenExternal}
                        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-11 text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <ExternalLink size={12} /> Open
                    </button>
                )}
                <button
                    onClick={close}
                    aria-label="Close preview"
                    className="flex items-center justify-center w-7 h-7 rounded-md text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                    <X size={14} />
                </button>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center p-6 pt-0">
                {src && (
                    <img
                        src={src}
                        alt={name}
                        onClick={e => e.stopPropagation()}
                        className="max-w-full max-h-full object-contain rounded-md shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
                    />
                )}
            </div>
        </div>,
        document.body,
    );
}
