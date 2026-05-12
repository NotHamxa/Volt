export type TipCategory = "Shortcut" | "Search" | "Apps" | "Web" | "Files" | "Commands";

export interface Tip {
    id: string;
    category: TipCategory;
    title: string;
    body: string;
    keys?: string[];
}

export const tips: Tip[] = [
    {
        id: "shift-enter-context",
        category: "Shortcut",
        title: "Open the context menu on a result",
        body: "Highlight any result and press Shift+Enter to open its right-click menu — pin apps, copy paths, open as admin, and more.",
        keys: ["Shift", "Enter"],
    },
    {
        id: "tab-switch-modes",
        category: "Shortcut",
        title: "Tab to switch to web search",
        body: "Press Tab to flip between searching your system and the web. Tab again to come back.",
        keys: ["Tab"],
    },
    {
        id: "ctrl-h-settings",
        category: "Shortcut",
        title: "Jump to Settings instantly",
        body: "Ctrl+H opens Settings from anywhere. Press it again to come right back to search.",
        keys: ["Ctrl", "H"],
    },
    {
        id: "esc-clear",
        category: "Shortcut",
        title: "Esc clears and resets",
        body: "Press Esc to clear your query and return to the home view. Press it again to hide Volt.",
        keys: ["Esc"],
    },
    {
        id: "bangs",
        category: "Web",
        title: "Use bangs to jump to a site",
        body: "Type !yt cats or !g recipes to search YouTube or Google directly. Over 10,000 bangs are supported — browse them in Settings → Quick Bangs.",
        keys: ["!", "yt"],
    },
    {
        id: "cmd-bang",
        category: "Commands",
        title: "Run shell commands with !cmd",
        body: "Type a command followed by !cmd and press Enter to run it in your shell — e.g. ipconfig !cmd.",
        keys: ["!", "cmd"],
    },
    {
        id: "pin-apps",
        category: "Apps",
        title: "Pin your favourite apps",
        body: "Right-click any app result (or press Shift+Enter) and choose Pin to Start. Pinned apps show on the home view for one-click launch.",
    },
    {
        id: "drag-reorder",
        category: "Apps",
        title: "Drag pinned apps to reorder",
        body: "Click and drag any pinned app or link on the home view to rearrange them however you like.",
    },
    {
        id: "open-as-admin",
        category: "Apps",
        title: "Open apps as Administrator",
        body: "Right-click an app result and choose Open as Administrator to launch it elevated.",
    },
    {
        id: "file-actions",
        category: "Files",
        title: "Quick file actions",
        body: "Right-click any file result to open its folder, copy its path, or open it with a different app.",
    },
    {
        id: "search-index",
        category: "Search",
        title: "Index more folders",
        body: "Volt only searches folders you've indexed. Add folders in Settings → Search Index to find files anywhere on your machine.",
    },
    {
        id: "custom-commands",
        category: "Commands",
        title: "Build your own commands",
        body: "Settings → Commands lets you create custom commands that run scripts or open URLs from the search bar.",
    },
    {
        id: "filter-results",
        category: "Search",
        title: "Filter your results",
        body: "When searching, use the filter button on the right of the search bar to toggle apps, files, folders, settings or commands.",
    },
    {
        id: "settings-search",
        category: "Search",
        title: "Find Windows settings fast",
        body: "Just type a setting name — like 'bluetooth' or 'display' — and Volt jumps you straight into Windows Settings.",
    },
    {
        id: "alphabet-jump",
        category: "Apps",
        title: "Alphabet jump in All Apps",
        body: "On the All Apps page, click any letter on the right rail to jump to that section instantly.",
    },
    {
        id: "link-shortcuts",
        category: "Web",
        title: "Pin link shortcuts",
        body: "Tap the Plus button on the home view to pin frequently-visited URLs as one-click shortcuts.",
    },
];
