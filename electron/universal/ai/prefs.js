import Store from "electron-store";

/**
 * Non-secret AI preferences — which provider and model to open with, and the
 * default value for each provider's own controls.
 *
 * Lazily constructed for the same reason usage.js does it: importing this
 * module outside a running Electron app (tests, tooling) must not blow up.
 */
let _store = null;
const store = () => (_store ??= new Store());

const KEY = "aiPrefs";

const DEFAULTS = {
    providerId: null,
    model: null,
    // Per provider, keyed by provider id → { controlId: value }
    settings: {},
    // Directory the CLI providers run in; null means the managed default.
    workspace: null,
    // Model ids typed in by hand, per provider. Providers accept ids they never
    // advertise — the Claude CLI lists five aliases but takes any model name —
    // so remembering them is the only way an older model can join the list
    // without a hard-coded catalogue here that would go stale.
    customModels: {},
};

export function getPrefs() {
    const saved = store().get(KEY);
    if (!saved || typeof saved !== "object") return { ...DEFAULTS };
    return {
        providerId: saved.providerId ?? null,
        model: saved.model ?? null,
        settings: saved.settings && typeof saved.settings === "object" ? saved.settings : {},
        workspace: saved.workspace ?? null,
        customModels: saved.customModels && typeof saved.customModels === "object"
            ? saved.customModels
            : {},
    };
}

/** Merges rather than replaces, so a partial update can't drop the rest. */
export function setPrefs(patch) {
    const next = { ...getPrefs(), ...(patch ?? {}) };
    if (patch?.settings) {
        next.settings = { ...getPrefs().settings, ...patch.settings };
    }
    if (patch?.customModels) {
        next.customModels = { ...getPrefs().customModels, ...patch.customModels };
    }
    store().set(KEY, next);
    return next;
}
