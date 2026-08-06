export type SettingsSectionId =
    "settings" | "keys" | "folders" | "commands" | "bangs" | "ai" | "tips" | "about";

export type SettingsEntry = {
    section: SettingsSectionId;
    title: string;
    /** Shown under the title in results, so it should read as a description. */
    hint: string;
    /**
     * Words people reach for that aren't in the title. "dark mode" has to find
     * Appearance, and nobody calls the activation shortcut an "activation
     * shortcut" — they call it the hotkey.
     */
    keywords?: string[];
    /** Matches `data-setting` on the row, when the section marks one. */
    anchor?: string;
};

/**
 * What settings search looks through.
 *
 * Hand-written rather than collected from the rendered tree: only the open
 * section is mounted, so at any moment six sevenths of the settings don't
 * exist to be scraped — and searching only what you can already see is not
 * worth building. The cost is that a new setting has to be added here too.
 */
export const SETTINGS_INDEX: SettingsEntry[] = [
    // ── General ──────────────────────────────────────────────────────────
    {
        section: "settings", title: "Theme", anchor: "appearance",
        hint: "Match your system, or pin Volt to light or dark",
        keywords: ["appearance", "dark mode", "light mode", "colour", "color", "system"],
    },
    {
        section: "settings", title: "Open on Startup", anchor: "open-on-startup",
        hint: "Launch Volt when you sign in",
        keywords: ["autostart", "boot", "login", "start with windows"],
    },
    {
        section: "settings", title: "Clear History", anchor: "clear-history",
        hint: "Delete recent searches and usage statistics",
        keywords: ["delete", "recent", "usage", "privacy", "wipe"],
    },
    {
        section: "settings", title: "Factory Reset", anchor: "factory-reset",
        hint: "Reset Volt to its original state",
        keywords: ["wipe", "erase", "defaults", "start over"],
    },

    // ── Shortcuts ────────────────────────────────────────────────────────
    {
        section: "keys", title: "Open Volt", anchor: "open-volt",
        hint: "The global combination that summons the launcher",
        keywords: ["hotkey", "keybind", "activation", "global", "ctrl space", "alt space", "shortcut"],
    },
    {
        section: "keys", title: "Change a shortcut",
        hint: "Every key Volt responds to, and which ones you can remap",
        keywords: ["keyboard", "keybinding", "rebind", "remap", "hotkeys", "shortcuts"],
    },
    {
        section: "keys", title: "Switch to AI", anchor: "open-ai",
        hint: "The key that carries your query into the chat",
        keywords: ["tab", "chat", "ask ai"],
    },

    // ── Search index ─────────────────────────────────────────────────────
    {
        section: "folders", title: "Indexed Folders",
        hint: "Which folders Volt searches for files",
        keywords: ["files", "index", "add folder", "scan", "directory", "cache"],
    },

    // ── Commands ─────────────────────────────────────────────────────────
    {
        section: "commands", title: "Custom Commands",
        hint: "Scripts and shell commands you can run from search",
        keywords: ["script", "powershell", "ps1", "bat", "terminal", "run", "arguments"],
    },
    {
        section: "commands", title: "Import & Export Commands",
        hint: "Move your commands between machines",
        keywords: ["backup", "json", "share", "restore"],
    },

    // ── Bangs ────────────────────────────────────────────────────────────
    {
        section: "bangs", title: "Quick Bangs",
        hint: "Send a search straight to a specific site",
        keywords: ["!g", "!yt", "google", "youtube", "web search", "shortcut"],
    },

    // ── AI ───────────────────────────────────────────────────────────────
    {
        section: "ai", title: "AI Providers",
        hint: "Which backends are available, and keys for the ones that need them",
        keywords: ["claude", "codex", "openai", "gemini", "ollama", "api key", "cli", "chatgpt"],
    },
    {
        section: "ai", title: "AI Defaults",
        hint: "The provider and model a new conversation starts with",
        keywords: ["model", "default", "effort", "reasoning"],
    },
    {
        section: "ai", title: "AI Workspace",
        hint: "The directory the CLI providers run in",
        keywords: ["working directory", "folder", "cwd", "sandbox"],
    },

    // ── Tips ─────────────────────────────────────────────────────────────
    {
        section: "tips", title: "Tips & Shortcuts",
        hint: "Every keyboard shortcut, and whether tips show on the home view",
        keywords: ["keys", "hotkeys", "help", "hide tips"],
    },

    // ── About ────────────────────────────────────────────────────────────
    {
        section: "about", title: "Application Version",
        hint: "Which version you're on, and check for updates",
        keywords: ["update", "upgrade", "release", "changelog"],
    },
    {
        section: "about", title: "License & Credits",
        hint: "Licensing and the projects Volt is built on",
        keywords: ["open source", "attribution", "legal"],
    },
];

/** Ranked matches. Title hits outrank hint and keyword hits. */
export function searchSettings(query: string): SettingsEntry[] {
    const term = query.trim().toLowerCase();
    if (!term) return [];

    const scored: Array<{ entry: SettingsEntry; score: number }> = [];
    for (const entry of SETTINGS_INDEX) {
        const title = entry.title.toLowerCase();
        let score = 0;
        if (title.startsWith(term)) score = 100;
        else if (title.includes(term)) score = 80;
        else if (entry.keywords?.some(k => k.includes(term))) score = 55;
        else if (entry.hint.toLowerCase().includes(term)) score = 30;
        if (score) scored.push({ entry, score });
    }
    return scored.sort((a, b) => b.score - a.score).map(s => s.entry);
}
