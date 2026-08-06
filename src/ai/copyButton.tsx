import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copy-to-clipboard with a brief confirmation.
 *
 * The text is fetched lazily via `getText` so a code block can read its own
 * rendered DOM at click time rather than the caller reassembling it up front on
 * every render.
 */
export function CopyButton({ getText, label = "Copy", className = "" }: {
    getText: () => string;
    label?: string;
    className?: string;
}) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // The tick would otherwise be set on an unmounted button when a message is
    // replaced mid-confirmation.
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const copy = async () => {
        const text = getText();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            return; // clipboard denied — say nothing rather than claim success
        }
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1400);
    };

    return (
        <button
            onClick={copy}
            aria-label={copied ? "Copied" : label}
            title={copied ? "Copied" : label}
            className={`flex items-center justify-center w-6 h-6 rounded-md text-tone-350 hover:text-tone-800 transition-colors cursor-pointer ${className}`}
        >
            {copied
                ? <Check size={11} className="text-emerald-300/80" />
                : <Copy size={11} />}
        </button>
    );
}
