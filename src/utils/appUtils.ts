import { SearchQueryT } from "@/interfaces/searchQuery.ts";

/**
 * An app's identity for keys and lookups. The name alone isn't one: Google's
 * and Samsung's "Quick Share" are two apps with one name. The main process
 * keys app hotkeys the same way (launchHotkeys.js).
 */
export const appKey = (app: SearchQueryT) => `${app.source ?? ""}|${app.appId || app.path || app.name}`;

export const isSameApp = (a: SearchQueryT, b: SearchQueryT) =>
    a.appId === b.appId &&
    a.path === b.path &&
    a.name === b.name &&
    a.type === b.type &&
    a.source === b.source;
