import { useCallback, useEffect, useState } from "react";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";

// Shared across every list: icons don't change while Volt runs, and the main
// process already caches them per file type.
const icons = new Map<string, string | null>();

const wantsIcon = (item: SearchQueryT) => !!item.path && (item.type === "file" || item.type === "folder");

/**
 * The Windows icon for each file and folder result — Word's for a .docx,
 * the PDF reader's for a .pdf — fetched in one batch per result set.
 * Returns a lookup that yields undefined until an icon has arrived.
 */
export function useFileIcons(items: SearchQueryT[]) {
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const missing = items.filter(item => wantsIcon(item) && !icons.has(item.path!));
        if (!missing.length) return;
        let cancelled = false;
        window.file.getFileIcons(missing).then(result => {
            for (const [path, url] of Object.entries(result)) icons.set(path, url);
            if (!cancelled) setVersion(v => v + 1);
        });
        return () => { cancelled = true; };
    }, [items]);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is what invalidates the lookup
    return useCallback((item: SearchQueryT) => (item.path ? icons.get(item.path) ?? undefined : undefined), [version]);
}
