export type BindingGroup = "Global" | "Navigation" | "Results" | "AI" | "Settings";

export type Binding = {
    id: string;
    group: BindingGroup;
    label: string;
    description: string;
    /**
     * For the global shortcut this mirrors the main process's fallback, which
     * registers Ctrl+Space on a first run — Reset puts that back.
     */
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
        id: "open-volt", group: "Global", global: true, editable: true, default: "Ctrl+Space",
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
        id: "toggle-preview", group: "Results", editable: true, default: "Alt+P",
        label: "Preview pane", description: "Shows details, and a thumbnail for files, beside the results.",
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
        id: "settings-sections", group: "Settings", editable: false, default: "Ctrl+1…9",
        label: "Jump to section", description: "Opens the nth section in the rail.",
    },
];

/** Bindings the app actually dispatches on, by id. */
export const EDITABLE_IDS = BINDINGS.filter(b => b.editable && !b.global).map(b => b.id);

const MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"]);
const MODIFIER_NAMES = new Set(["Ctrl", "Alt", "Shift", "Super"]);

/**
 * Key names as Electron's accelerator parser spells them, so one combo string
 * works both for the window's own shortcuts and for globalShortcut. The DOM
 * says "ArrowUp" and "CapsLock"; Electron only takes "Up" and "Capslock", and
 * a literal "+" would split the combo text in the wrong place.
 */
const KEY_ALIASES: Record<string, string> = {
    " ": "Space", "+": "Plus",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    CapsLock: "Capslock", NumLock: "Numlock", ScrollLock: "Scrolllock",
    AudioVolumeUp: "VolumeUp", AudioVolumeDown: "VolumeDown", AudioVolumeMute: "VolumeMute",
    MediaTrackNext: "MediaNextTrack", MediaTrackPrevious: "MediaPreviousTrack",
    Return: "Enter", Esc: "Escape",
};

function normalizeKey(key: string): string {
    if (key in KEY_ALIASES) return KEY_ALIASES[key];
    if (key.length === 1) return key.toUpperCase();
    return key;
}

function keyName(e: KeyboardEvent): string | null {
    if (MODIFIERS.has(e.key)) return null;
    // IME composition and dead keys say nothing about which key was hit.
    if (e.key === "Unidentified" || e.key === "Process" || e.key === "Dead") return null;
    // Shift turns 1 into "!" — read the digit off the physical key so the
    // combo is still called Ctrl+Shift+1.
    const digit = /^Digit(\d)$/.exec(e.code);
    if (digit) return digit[1];
    return normalizeKey(e.key);
}

/** Rewrites a stored combo into today's key names ("Ctrl+ArrowUp" → "Ctrl+Up"). */
export function normalizeCombo(combo: string): string {
    if (!combo) return "";
    // "Ctrl++" was how a literal plus used to be saved.
    const trailingPlus = combo.endsWith("++");
    const parts = (trailingPlus ? combo.slice(0, -2) : combo).split("+").filter(Boolean);
    if (trailingPlus) parts.push("Plus");
    return parts.map(p => (MODIFIER_NAMES.has(p) ? p : normalizeKey(p))).join("+");
}

// Every key name Electron's accelerator parser accepts.
const ELECTRON_KEY = /^(?:[0-9A-Z]|F(?:[1-9]|1\d|2[0-4])|Plus|Space|Tab|Capslock|Numlock|Scrolllock|Backspace|Delete|Insert|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|VolumeUp|VolumeDown|VolumeMute|MediaNextTrack|MediaPreviousTrack|MediaStop|MediaPlayPause|PrintScreen|num[0-9]|numdec|numadd|numsub|nummult|numdiv|[)!@#$%^&*(:;=<,_\-.>?/~`{}[\]|\\'"])$/;

/**
 * The combo as an Electron accelerator, or null when it names a key
 * globalShortcut can't register (it throws on those rather than failing).
 */
export function toAccelerator(combo: string): string | null {
    const parts = normalizeCombo(combo).split("+");
    const key = parts.pop();
    if (!key || !ELECTRON_KEY.test(key)) return null;
    if (parts.some(p => !MODIFIER_NAMES.has(p))) return null;
    return [...parts, key].join("+");
}

// Keys a text field needs for itself. Bound bare, they'd fire while typing.
const TYPING_KEYS = new Set(["Space", "Plus", "Backspace", "Delete", "Home", "End", "Left", "Right", "Up", "Down", "Enter"]);

/** Whether the combo holds Ctrl, Alt or Win. Shift alone still types. */
export function hasCommandModifier(combo: string): boolean {
    return comboParts(combo).some(p => p === "Ctrl" || p === "Alt" || p === "Super");
}

/** A combo that is also just typing — a letter, digit, Space, Backspace… */
export function isTypingCombo(combo: string): boolean {
    if (!combo || hasCommandModifier(combo)) return false;
    const parts = comboParts(combo);
    const key = parts[parts.length - 1] ?? "";
    return key.length === 1 || TYPING_KEYS.has(key);
}

/**
 * Every concrete combo a binding's text stands for. Structural rows are
 * written for reading — "Up / Down" is two combos, "Ctrl+1…8" eight.
 */
export function expandCombo(text: string): string[] {
    if (!text) return [];
    return text.split(" / ").flatMap(part => {
        const range = /^(.*?)(\d)…(\d)$/.exec(part);
        if (!range) return [part];
        const [, prefix, from, to] = range;
        const out: string[] = [];
        for (let n = Number(from); n <= Number(to); n++) out.push(prefix + n);
        return out;
    });
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
