export interface ChangelogEntry {
    version: string;
    date: string;
    highlights: string[];
    sections: {
        title: string;
        items: string[];
    }[];
}

const changelog: ChangelogEntry[] = [
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
