export interface ChangelogEntry {
    version: string;
    date: string;
    highlights: string[];
    /**
     * Offer the tour from the update window. For releases that change enough
     * that someone upgrading — who never sees the first-run intro — would
     * want walking through it.
     */
    tour?: boolean;
    sections: {
        title: string;
        items: string[];
    }[];
}

const changelog: ChangelogEntry[] = [
    {
        version: "2.0.0",
        date: "2026-10-21",
        tour: true,
        highlights: [
            "A fresh new look, with a light theme",
            "An AI chat that shows its work",
            "App groups and global hotkeys",
        ],
        sections: [
            {
                title: "A Fresh New Look",
                items: [
                    "A redesigned home screen: your pinned apps fill the space above a links dock that never moves, with no limit on how many of either",
                    "Group apps by dragging one onto another — a group shows its first four icons and opens into its own grid",
                    "A light theme alongside the dark one — pick System, Light or Dark in Settings → General",
                    "Settings is laid out down the left side, with a search box (Ctrl + F) to find any setting",
                    "Real Windows icons for files and folders, and sharper icons for every app",
                    "Cleaner, more consistent text and spacing throughout",
                ],
            },
            {
                title: "New Features",
                items: [
                    "The AI chat shows each step Claude or Codex takes, where it happened in the answer — what it ran, read or edited, whether it worked, and its output a click away — along with its thinking and to-do list",
                    "Choose how much the AI may do: Ask first, Auto-edit, Auto or Full access (and Plan for Claude). Claude and Codex both ask before running commands or changing files, and the mode you pick becomes your default",
                    "Each AI answer shows the model, time and tokens used, and how much of your Claude plan's window is spent",
                    "Give any app or link a global hotkey in Settings → Apps and Settings → Links — it opens from anywhere in Windows",
                    "Links open with Ctrl + 1–9, and your pinned links now show up in search",
                    "Preview pane (Alt + P): thumbnails, PDF first pages, file details and quick actions beside your results",
                    "A Shortcuts section to rebind Volt's keys",
                    "Search is one ranked list of apps, files, commands, settings and the web, with the rest of a name hinted as you type",
                    "Importing commands lets you review every script before it's saved",
                    "A new welcome tour that takes you through search, the home screen, the AI chat and the Settings worth knowing",
                ],
            },
            {
                title: "Improvements",
                items: [
                    "Search learns which result you pick for a query, ranks by how well things match, and finds apps by their initials (vsc → Visual Studio Code) or without accents",
                    "Much faster: search over very large folders is up to ten times quicker, app icons appear in under two seconds, and indexing no longer holds up startup",
                    "The installer is half the size, and Volt now runs on Electron 44",
                    "The app list matches Start's All apps, and Store installs and uninstalls appear within seconds",
                    "Commands run more reliably, and the built-in commands work properly on Windows 11",
                    "A failed update check says so, with a Try Again button, and the version number in Settings is now the update button",
                    "Claude and Codex are found wherever they're installed, and the AI integrations run on the latest Claude Agent SDK and Codex app server",
                    "The AI chat can stay open while you click away — the pin in its corner shows it and turns it off",
                ],
            },
            {
                title: "Bug Fixes",
                items: [
                    "Security: file actions, command arguments and dropped HTML files can no longer be used to run code",
                    "Volt no longer freezes on startup with very large indexed folders, and new or moved files are picked up reliably",
                    "Typing a command's full name now picks that command, and failed commands show their actual error",
                    "Dismissing Volt returns you to the window you were using, and the loading screen never gets stuck",
                    "Apps no longer appear twice or replace a namesake, and apps without a Start shortcut can be launched",
                    "Leaving Settings with unsaved changes asks first, and Tab in a settings field no longer jumps to the AI chat",
                    "AI chats survive switching providers mid-reply, keep their errors, and can't be corrupted by closing Volt",
                    "A downloaded update is no longer thrown away when you quit from the tray",
                ],
            },
        ],
    },
    {
        version: "1.1.7",
        date: "2026-06-11",
        highlights: [
            "Bug fixes",
        ],
        sections: [
            {
                title: "Bug Fixes",
                items: [
                    "Search results no longer cap at 5 when multiple filter types are active - results now scale based on how many categories actually match",
                    "Fixed update installer falling back to a full download after a failed differential attempt - updates now download correctly on the first try",
                ],
            },
        ],
    },
    {
        version: "1.1.6",
        date: "2026-05-13",
        highlights: [
            "Custom commands now accept arguments",
            "Visible terminal output for scripts",
            "Tips banner on the home view",
        ],
        sections: [
            {
                title: "New Features",
                items: [
                    "Custom commands support arguments — define named args with optional defaults and a required flag, reference them in the script with `{argName}`, and Volt prompts for values inline when you run the command",
                    "Pass values inline by typing `commandName value1 \"value with spaces\"` in the search bar — only missing required args trigger the prompt",
                    "Two new command types: Open in terminal and Open in terminal (with confirm) — spawns a visible cmd or PowerShell window so you can read the output",
                    "\"Did you know?\" tip banner on the home view rotating through hidden features, plus a full Tips & Shortcuts page in Settings",
                ],
            },
        ],
    },
    {
        version: "1.1.5",
        date: "2026-04-17",
        highlights: [
            "Steam games show up alongside your apps",
            "More reliable app detection",
        ],
        sections: [
            {
                title: "New Features",
                items: [
                    "Steam library detection — installed Steam games appear alongside regular apps",
                ],
            },
            {
                title: "Improvements",
                items: [
                    "Improved app detection for more reliable results",
                ],
            },
        ],
    },
    {
        version: "1.1.4",
        date: "2026-03-24",
        highlights: [
            "Custom shell commands — run anything from the search bar",
            "Redesigned settings & search bar UI",
            "Faster, smarter search results",
        ],
        sections: [
            {
                title: "New Features",
                items: [
                    "Custom Commands — add your own shell commands that appear directly in search results",
                    "Import & export command sets as JSON for easy sharing and backup",
                    "Inline editing and confirmation toggle for custom commands",
                    "Check for Updates button in Settings → About",
                    "What's New modal shown automatically after updates",
                ],
            },
            {
                title: "UI Improvements",
                items: [
                    "Settings page redesigned with sidebar navigation and smooth section transitions",
                    "Segmented Files/Web toggle pill replaces plain text in the search bar",
                    "Tooltips on pinned apps showing app name and on pinned links showing URL",
                    "Alphabet quick-jump sidebar in the All Apps list",
                    "Improved loading screen with animated progress bar",
                    "Compact lock/unlock toast in the corner instead of full-screen overlay",
                    "Active filter count badge on the search filter button",
                    "Updated intro walkthrough with Commands page and clickable page dots",
                ],
            },
            {
                title: "Search Optimizations",
                items: [
                    "Commands are now searched from an in-memory cache instead of static JSON for faster results",
                    "Normalized string matching cached per entry — no recomputation on repeat searches",
                    "Search results cleaned before returning to avoid leaking internal fields",
                    "Web search suggestions sanitized to prevent XSS from external sources",
                ],
            },
            {
                title: "Bug Fixes",
                items: [
                    "Fixed duplicate and incorrect entries in the Windows settings list",
                    "Added missing Windows 11 settings (Storage, Multitasking, Remote Desktop, etc.)",
                    "Fixed error boundary missing — unhandled component errors no longer white-screen the app",
                ],
            },
        ],
    },
];

export function getChangelogForVersion(version: string): ChangelogEntry | undefined {
    return changelog.find((entry) => entry.version === version);
}

export function getLatestChangelog(): ChangelogEntry | undefined {
    return changelog[0];
}

export default changelog;
