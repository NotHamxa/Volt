/** Details for the preview pane, looked up by the main process. */
export type ItemPreview = {
    kind: string;
    /** Set when the item couldn't be read — e.g. the file was deleted. */
    error?: string;
    /** Data URL of the Windows shell thumbnail (image, video, PDF, Office…). */
    thumbnail?: string | null;
    /** Large file-type icon, when there is no thumbnail. */
    icon?: string | null;
    extension?: string;
    size?: number;
    modified?: number;
    created?: number;
    /** Entries directly inside a folder. */
    items?: number | null;
    excerpt?: { text: string; truncated: boolean } | null;
    /** Epoch ms of the last time Volt opened it. */
    lastUsed?: number | null;
    // Apps
    source?: string | null;
    appId?: string | null;
    target?: string | null;
    args?: string | null;
    description?: string | null;
};
