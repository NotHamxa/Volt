import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {appKey} from "@/utils/appUtils.ts";

/**
 * Groups of pinned apps, shown on the home screen as one tile that opens
 * into its own grid.
 *
 * Kept beside `pinnedApps` rather than inside it: the flat list stays what
 * every other part of Volt already reads — what's pinned, in what order — and
 * a group only says which of those belong together and what they're called.
 * A group stands in the grid where its first member would, and its members
 * are kept next to each other in the flat list, so reordering the grid is
 * still just reordering that list.
 */
export type AppGroup = { id: string; name: string; apps: string[] };

export type HomeItem =
    | { kind: "app"; id: string; app: SearchQueryT }
    | { kind: "group"; id: string; groupId: string };

export const GROUPS_KEY = "pinnedGroups";
export const groupItemId = (id: string) => `group:${id}`;

/**
 * The groups as last read or saved, for the life of the window. The home
 * screen starts from these when it mounts again, rather than drawing every
 * app loose and folding them into groups a moment later. Null until the
 * first read.
 */
let remembered: AppGroup[] | null = null;
export const rememberedGroups = () => remembered;

export async function loadGroups(): Promise<AppGroup[]> {
    let groups: AppGroup[] = [];
    try {
        const parsed = JSON.parse(await window.electronStore.get(GROUPS_KEY) ?? "[]");
        if (Array.isArray(parsed)) {
            groups = parsed.filter(g => g && typeof g.id === "string" && Array.isArray(g.apps))
                .map(g => ({ id: g.id, name: String(g.name ?? "Group"), apps: g.apps.filter((k: unknown) => typeof k === "string") }));
        }
    } catch { /* unreadable groups: every app shows on its own */ }
    remembered = groups;
    return groups;
}

export function saveGroups(groups: AppGroup[]) {
    remembered = groups;
    window.electronStore.set(GROUPS_KEY, JSON.stringify(groups));
}

/**
 * Groups as they stand against what's pinned now. An app unpinned from
 * search, or dropped when its install went away, leaves its group; a group
 * left empty goes with it.
 */
export function liveGroups(groups: AppGroup[], pinned: SearchQueryT[]): AppGroup[] {
    const keys = new Set(pinned.map(appKey));
    const claimed = new Set<string>();
    return groups
        .map(g => ({
            ...g,
            // An app sits in one group at most; the first to claim it keeps it.
            apps: g.apps.filter(k => keys.has(k) && !claimed.has(k) && (claimed.add(k), true)),
        }))
        .filter(g => g.apps.length > 0);
}

/** The home grid: apps in pinned order, each group standing where its first member would. */
export function homeItems(pinned: SearchQueryT[], groups: AppGroup[]): HomeItem[] {
    const memberOf = new Map<string, string>();
    for (const g of groups) for (const k of g.apps) memberOf.set(k, g.id);
    const placed = new Set<string>();
    const items: HomeItem[] = [];
    for (const app of pinned) {
        const key = appKey(app);
        const groupId = memberOf.get(key);
        if (!groupId) {
            items.push({ kind: "app", id: key, app });
        } else if (!placed.has(groupId)) {
            placed.add(groupId);
            items.push({ kind: "group", id: groupItemId(groupId), groupId });
        }
    }
    return items;
}

/** Back to the flat pinned list: each group's members together, in the group's own order. */
export function flatten(items: HomeItem[], groups: AppGroup[], pinned: SearchQueryT[]): SearchQueryT[] {
    const byKey = new Map(pinned.map(app => [appKey(app), app]));
    const byId = new Map(groups.map(g => [g.id, g]));
    return items.flatMap(item => item.kind === "app"
        ? [item.app]
        : (byId.get(item.groupId)?.apps ?? []).map(k => byKey.get(k)).filter((a): a is SearchQueryT => Boolean(a)));
}
