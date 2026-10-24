import { globalShortcut } from "electron";
import { launchApp } from "../platform.js";
import { openExternalSafely } from "../ipc/electron.ipc.js";

const LINK_SCHEMES = new Set(["http:", "https:"]);

// Only what launching needs. The catalog entry carries search-only fields too.
const APP_FIELDS = ["name", "type", "appId", "path", "source", "target", "targetArgs", "installLocation"];

/** Same identity the pinned apps use: a name alone is shared by two Quick Shares. */
export const appKey = (app) => `${app?.source ?? ""}|${app?.appId || app?.path || app?.name}`;

const lower = (s) => String(s ?? "").toLowerCase();

/**
 * Global hotkeys that open an app or a pinned link from anywhere in Windows.
 *
 * App hotkeys live in the store as `appHotkeys` ([{ combo, app }]). A link's
 * hotkey rides on the link itself (`hotkey` in `linkShortcuts`), so editing
 * its URL keeps the key and removing the link takes the key with it.
 *
 * Registrations are reconciled against the store rather than tracked edit by
 * edit, and each one looks its target up when pressed, so a key can't go on
 * opening something the store no longer says it should.
 */
export function createLaunchHotkeys({ store, cache, getOpenShortcut, hideIfShown }) {
    /** Accelerators Volt currently holds for launching. */
    const live = new Set();

    const readApps = () => {
        const value = store.get("appHotkeys");
        return Array.isArray(value) ? value.filter(e => e?.combo && e?.app) : [];
    };

    const readLinks = () => {
        try {
            const value = JSON.parse(store.get("linkShortcuts") ?? "[]");
            return Array.isArray(value) ? value : [];
        } catch {
            return [];
        }
    };

    /** Every hotkey the store asks for, combo → what it opens. */
    const wanted = () => {
        const out = new Map();
        for (const { combo, app } of readApps()) {
            out.set(combo, { kind: "app", id: appKey(app), label: app.name, app });
        }
        for (const link of readLinks()) {
            if (!link?.hotkey || !link.shortcut) continue;
            out.set(link.hotkey, { kind: "link", id: link.shortcut, label: link.name, url: link.shortcut });
        }
        return out;
    };

    // The stored copy goes stale when an app updates (a new exe path, a new
    // package version), so prefer the catalog's current entry.
    const resolveApp = (app) => {
        const apps = cache.appCache ?? [];
        return (app.appId && apps.find(a => a.source === app.source && a.appId === app.appId))
            || (app.path && apps.find(a => lower(a.path) === lower(app.path)))
            || (app.appId && apps.find(a => a.appId === app.appId))
            || app;
    };

    const fire = (combo) => {
        const target = wanted().get(combo);
        if (!target) return;
        hideIfShown();
        if (target.kind === "app") launchApp(resolveApp(target.app), false);
        else openExternalSafely(target.url, LINK_SCHEMES);
    };

    const register = (combo) => {
        try {
            if (!globalShortcut.register(combo, () => fire(combo))) return false;
        } catch (err) {
            console.warn("Could not register launch hotkey:", combo, err?.message);
            return false;
        }
        live.add(combo);
        return true;
    };

    /**
     * Brings the registrations in line with the store. A combo another app
     * holds is skipped and retried on the next sync; list() reports it.
     */
    const sync = () => {
        const want = wanted();
        for (const combo of live) {
            if (want.has(combo)) continue;
            globalShortcut.unregister(combo);
            live.delete(combo);
        }
        for (const combo of want.keys()) {
            if (!live.has(combo) && combo !== getOpenShortcut()) register(combo);
        }
    };

    const persist = (target, id, combo) => {
        if (target.kind === "app") {
            const next = readApps().filter(e => appKey(e.app) !== id);
            if (combo) {
                const app = Object.fromEntries(APP_FIELDS.filter(f => target.app[f] != null).map(f => [f, target.app[f]]));
                next.push({ combo, app });
            }
            store.set("appHotkeys", next);
            return true;
        }
        const links = readLinks();
        const link = links.find(l => l?.shortcut === id);
        if (!link) return false;
        if (combo) link.hotkey = combo;
        else delete link.hotkey;
        store.set("linkShortcuts", JSON.stringify(links));
        return true;
    };

    /**
     * Gives a target a hotkey, or takes it away when `combo` is empty. The new
     * key is registered before anything is saved, so a combo Windows refuses
     * leaves the old one in place. Answers null when it took, otherwise why not.
     */
    const set = (target, combo) => {
        if (target?.kind !== "app" && target?.kind !== "link") return "Nothing to assign that to.";
        const id = target.kind === "app" ? appKey(target.app) : target.url;
        const want = wanted();
        const current = [...want].find(([, t]) => t.kind === target.kind && t.id === id)?.[0] ?? null;

        if (combo) {
            if (combo === current) return null;
            if (combo === getOpenShortcut()) return "That's the shortcut that opens Volt.";
            const owner = want.get(combo);
            if (owner) return `Already opens "${owner.label}".`;
            if (!register(combo)) return "Windows wouldn't grant that combination. Something else is using it.";
        }

        if (!persist(target, id, combo)) {
            sync();
            return "That link isn't pinned any more.";
        }
        sync();
        return null;
    };

    /** What each hotkey opens, and whether Windows let Volt have it. */
    const list = () => [...wanted()].map(([combo, t]) => ({
        kind: t.kind,
        id: t.id,
        label: t.label,
        combo,
        active: live.has(combo),
        ...(t.kind === "app" ? { app: t.app } : {}),
    }));

    /** The label of whatever a combo already opens, if anything. */
    const owner = (combo) => wanted().get(combo)?.label ?? null;

    return { sync, set, list, owner };
}
