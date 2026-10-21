import { SearchQueryT } from "@/interfaces/searchQuery.ts";

/** What a global hotkey can open. A link is identified by its URL. */
export type LaunchTarget =
    | { kind: "app"; app: SearchQueryT }
    | { kind: "link"; url: string };

export type LaunchHotkey = {
    kind: "app" | "link";
    /** appKey() for an app, the URL for a link. */
    id: string;
    label: string;
    combo: string;
    /** False while another program holds the combination. */
    active: boolean;
    /** Apps only: the stored entry, so an uninstalled app can still be listed. */
    app?: SearchQueryT;
};
