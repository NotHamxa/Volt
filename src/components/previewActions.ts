import { AppWindowIcon, Copy, Files, FolderOpen, Play, ShieldCheck, Sparkles, SquareArrowOutUpRight, type LucideIcon } from "lucide-react";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";

export const COMMAND_TYPES = new Set(["command", "commandOpen", "commandConfirm", "commandConfirmOpen"]);

export type PreviewActionId = "open" | "admin" | "openWith" | "location" | "copyPath" | "copyFile";
export type PreviewAction = { id: PreviewActionId; label: string; icon: LucideIcon };

/**
 * What can be done with a result from the pane, top to bottom. Shared with
 * the results list, which walks these with the arrow keys.
 */
export function previewActions(item: SearchQueryT | null): PreviewAction[] {
    if (!item) return [];
    const { type, path } = item;
    const isCommand = COMMAND_TYPES.has(type);
    if (type === "webSuggestion" && !path) return [];

    const actions: PreviewAction[] = [{
        id: "open",
        label: isCommand ? "Run" : type === "askAi" ? "Ask AI" : "Open",
        icon: isCommand ? Play : type === "askAi" ? Sparkles : SquareArrowOutUpRight,
    }];
    if (type === "app") actions.push({ id: "admin", label: "Run as administrator", icon: ShieldCheck });
    if (type === "file" && path) actions.push({ id: "openWith", label: "Open with…", icon: AppWindowIcon });
    const onDisk = (type === "file" || type === "folder" || type === "app") && !!path;
    if (onDisk) {
        actions.push({ id: "location", label: "Open file location", icon: FolderOpen });
        actions.push({ id: "copyPath", label: "Copy path", icon: Copy });
    }
    if (type === "file" && path) actions.push({ id: "copyFile", label: "Copy file", icon: Files });
    return actions;
}
