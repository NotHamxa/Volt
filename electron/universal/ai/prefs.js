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
    // Lets the Claude CLI run tools (Bash, file writes, fetches) without
    // asking. Off unless switched on deliberately in Settings.
    claudeSkipPermissions: false,
    // The AI view keeps the launcher open when you click away, so an answer
    // isn't dismissed mid-stream. Switched off from the pin in the AI view.
    keepOpen: true,
};

/**
 * Codex picked a sandbox before it had modes. A saved sandbox becomes the
 * mode it maps to, so the picker shows what the turn will actually do.
 */
const CODEX_MODE_FOR_SANDBOX = { "read-only": "ask", "workspace-write": "edits", "danger-full-access": "full" };

export function withCodexMode(settings) {
    if (!settings || typeof settings !== "object" || settings.mode || !CODEX_MODE_FOR_SANDBOX[settings.sandbox]) return settings;
    const { sandbox, ...rest } = settings;
    return { ...rest, mode: CODEX_MODE_FOR_SANDBOX[sandbox] };
}

export function getPrefs() {
    const saved = store().get(KEY);
    if (!saved || typeof saved !== "object") return { ...DEFAULTS };
    let settings = saved.settings && typeof saved.settings === "object" ? saved.settings : {};
    // The old all-or-nothing switch became Claude's mode picker. Someone who
    // had it on starts in Full access, rather than finding it quietly off.
    if (saved.claudeSkipPermissions === true && !settings["claude-code"]?.mode) {
        settings = { ...settings, "claude-code": { ...settings["claude-code"], mode: "full" } };
    }
    settings = { ...settings, codex: withCodexMode(settings.codex) };
    return {
        providerId: saved.providerId ?? null,
        model: saved.model ?? null,
        settings,
        workspace: saved.workspace ?? null,
        customModels: saved.customModels && typeof saved.customModels === "object"
            ? saved.customModels
            : {},
        // Strictly true, so a malformed value can never switch it on.
        claudeSkipPermissions: saved.claudeSkipPermissions === true,
        keepOpen: saved.keepOpen !== false,
    };
}

/** Merges rather than replaces, so a partial update can't drop the rest. */
export function setPrefs(patch) {
    const next = { ...getPrefs(), ...(patch ?? {}) };
    if (patch?.settings) {
        next.settings = { ...getPrefs().settings, ...patch.settings };
    }
    if (patch && "claudeSkipPermissions" in patch) {
        next.claudeSkipPermissions = patch.claudeSkipPermissions === true;
    }
    if (patch?.customModels) {
        next.customModels = { ...getPrefs().customModels, ...patch.customModels };
    }
    store().set(KEY, next);
    return next;
}
