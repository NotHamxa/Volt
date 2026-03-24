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
