export type BindingGroup = "Global" | "Navigation" | "Results" | "AI" | "Settings";

export type Binding = {
    id: string;
    group: BindingGroup;
    label: string;
    description: string;
    /** Empty for the global shortcut, which has no default until you set one. */
    default: string;
    /**
     * Structural keys are listed but not rebindable. Enter, Escape and the
     * arrows aren't commands so much as how a list works — remapping them
     * would leave the app with no way to accept or back out of anything.
     */
    editable: boolean;
    /** Registered with the OS rather than the window, so it works anywhere. */
    global?: boolean;
};

export const BINDINGS: Binding[] = [
    {
        id: "open-volt", group: "Global", global: true, editable: true, default: "",
        label: "Open Volt",
        description: "Summon the launcher from anywhere. Needs at least two keys.",
    },

    {
        id: "open-settings", group: "Navigation", editable: true, default: "Ctrl+H",
        label: "Open settings", description: "Toggle between search and settings.",
    },
    {
        id: "open-ai", group: "Navigation", editable: true, default: "Tab",
        label: "Switch to AI", description: "Carries whatever you've typed into the chat.",
    },
    {
        id: "dismiss", group: "Navigation", editable: false, default: "Escape",
        label: "Back / dismiss", description: "Steps back a level, then hides the window.",
    },

    {
        id: "results-move", group: "Results", editable: false, default: "Up / Down",
        label: "Move through results", description: "Walks the result list.",
    },
    {
        id: "results-run", group: "Results", editable: false, default: "Enter",
        label: "Run result", description: "Opens the highlighted app, file or command.",
    },
    {
        id: "results-menu", group: "Results", editable: false, default: "Shift+Enter",
        label: "Result actions", description: "Opens the context menu for the highlighted result.",
    },
    {
        id: "results-complete", group: "Results", editable: false, default: "Right",
        label: "Accept suggestion", description: "Takes the greyed-out completion in the search box.",
    },

    {
        id: "ai-new-chat", group: "AI", editable: true, default: "Ctrl+N",
        label: "New conversation", description: "Starts a fresh chat, leaving any running answer to finish.",
    },
    {
        id: "ai-send", group: "AI", editable: false, default: "Enter",
        label: "Send prompt", description: "Shift+Enter inserts a newline instead.",
    },

    {
        id: "settings-search", group: "Settings", editable: true, default: "Ctrl+F",
        label: "Search settings", description: "Finds a setting in any section.",
    },
    {
        id: "settings-sections", group: "Settings", editable: false, default: "Ctrl+1…7",
        label: "Jump to section", description: "Opens the nth section in the rail.",
    },
];

/** Bindings the app actually dispatches on, by id. */
export const EDITABLE_IDS = BINDINGS.filter(b => b.editable && !b.global).map(b => b.id);

const MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta"]);

function keyName(e: KeyboardEvent): string | null {
    if (MODIFIERS.has(e.key)) return null;
    if (e.key === " ") return "Space";
    if (e.key.length === 1) return e.key.toUpperCase();
    return e.key;
}

/** Canonical text for whatever was just pressed, e.g. "Ctrl+Shift+P". */
export function comboFromEvent(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Super");
    const key = keyName(e);
    if (key) parts.push(key);
    return parts.join("+");
}

export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
    if (!combo) return false;
    return comboFromEvent(e) === combo;
}

/** Splits a combo for rendering as separate keycaps. */
export function comboParts(combo: string): string[] {
    return combo ? combo.split("+") : [];
}
