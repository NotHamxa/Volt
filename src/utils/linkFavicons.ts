/**
 * Link favicons, remembered for the life of the window, the same reason as
 * app logos: a link that mounts again (back on the home screen, or as a
 * search result) shows its icon at once rather than a blank chip.
 * Concurrent asks for one link share a single request.
 */
const found = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** The favicon if it's already known, synchronous, for a first render. */
export function cachedFavicon(url: string): string | undefined {
    return found.get(url);
}

export function linkFavicon(url: string): Promise<string | null> {
    const known = found.get(url);
    if (known) return Promise.resolve(known);
    let request = pending.get(url);
    if (!request) {
        request = window.apps.getLinkFavicon(url)
            .then(icon => {
                if (icon) found.set(url, icon);
                return icon ?? null;
            })
            .catch(() => null)
            .finally(() => pending.delete(url));
        pending.set(url, request);
    }
    return request;
}
