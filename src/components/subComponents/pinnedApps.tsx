import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {ReactNode, useEffect, useState} from "react";
import {ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
    ContextMenuItem,
    ContextMenuSeparator} from "@/components/ui/context-menu.tsx";
import {AppWindowIcon, FolderOpen, PinOff, ShieldCheck, Trash2} from "lucide-react";
import {AnimateLayoutChanges, useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import {useEscapeBarrier} from "@/hooks/useEscape.ts";
import {appLogo, cachedAppLogo} from "@/utils/appLogos.ts";
interface IPinnedApp {
    app: SearchQueryT;
    unPinApp: (app: SearchQueryT) => void;
    /** Menu items that depend on where the tile is — grouping, from the home screen. */
    menu?: ReactNode;
    /** Another app is held over this one, and letting go groups them. */
    dropTarget?: boolean;
}

interface ISortable {
    id: string;
    /**
     * The dragged copy is drawn elsewhere (the home grid's drag overlay), so
     * while dragging this tile only marks the slot it will land in.
     */
    ghosted?: boolean;
}

/** `id` is the pin's identity from the list — not the name, which two apps can share. */
export default function SortablePinnedApp({id, app, unPinApp, menu, dropTarget, ghosted}: IPinnedApp & ISortable) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({id, animateLayoutChanges: ghosted ? slideWhileSorting : undefined});

    const style = ghosted && isDragging
        ? { opacity: 0.25 }
        : { transform: CSS.Transform.toString(transform), transition };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="snap-start">
            <PinnedApp app={app} unPinApp={unPinApp} menu={menu} dropTarget={dropTarget}/>
        </div>
    );
}

/**
 * On the home grid, tiles change places by moving in the page; this slides
 * them there rather than letting them jump.
 */
const slideWhileSorting: AnimateLayoutChanges = ({isSorting, wasDragging}) => isSorting || wasDragging;

/**
 * The tile as it looks under the cursor while being dragged. Over a tile it
 * would join, it shrinks to its icon, so the lit tile beneath stays readable.
 */
export function PinnedAppGhost({app, merging}: {app: SearchQueryT; merging?: boolean}) {
    const logo = cachedAppLogo(app);
    return (
        <div className={`flex items-center justify-start w-25 h-22.5 rounded-lg flex-col overflow-hidden text-center select-none pt-1.25 cursor-grabbing transition-all duration-150 ${
            merging ? "scale-75 opacity-80" : "bg-fill-100 shadow-[0_10px_28px_var(--shadow-2)] scale-105"
        }`}>
            {logo ? <img className="w-9 h-9 object-contain drop-shadow-[0_4px_10px_var(--shadow-2)]" src={logo} alt=""/> : <AppWindowIcon size={36}/>}
            <label className={`mt-2 text-12 max-w-22.5 truncate transition-opacity ${merging ? "opacity-0" : ""}`}>{app.name}</label>
        </div>
    );
}

function PinnedApp({app, unPinApp, menu, dropTarget}: IPinnedApp) {
    // Starts from a logo already found, so coming back to the home screen
    // doesn't flash empty tiles while the request goes out again.
    const [logo, setLogo] = useState<string>(() => cachedAppLogo(app) ?? "");
    const [menuOpen, setMenuOpen] = useState(false);
    useEscapeBarrier(menuOpen);

    useEffect(() => {
        if (!app) return;
        let cancelled = false;
        appLogo(app).then(found => {
            if (found && !cancelled) setLogo(found);
        });
        return () => { cancelled = true; };
    }, [app]);

    return (
        <ContextMenu onOpenChange={setMenuOpen}>
            <ContextMenuTrigger>
                <TooltipProvider delayDuration={500}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            {/* 100 × 90 — APP_TILE in utils/homeTiles.ts must match. */}
                            <button
                                aria-label={`Open ${app.name}`}
                                className={`flex items-center justify-start w-25 h-22.5 rounded-lg transition-all duration-150 cursor-pointer flex-col overflow-hidden text-center select-none pt-1.25 active:scale-95 ${
                                    dropTarget ? "bg-fill-150 ring-2 ring-ink/25 scale-105" : "bg-transparent hover:bg-fill-140"
                                }`}
                                onClick={async () => {
                                    await window.apps.openApp(app);
                                }}
                            >
                                {logo ? (
                                    <img className="w-9 h-9 object-contain" src={logo}/>
                                ) : (
                                    <AppWindowIcon size={36}/>
                                )}
                                <label className="mt-2 text-12 max-w-22.5 truncate">{app.name}</label>
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-surface/[0.98] border border-line-100 text-tone-700 text-11">
                            {app.name}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </ContextMenuTrigger>
            <ContextMenuContent>
                {menu && <>{menu}<ContextMenuSeparator/></>}
                <ContextMenuItem onClick={() => unPinApp(app)}>
                    <div className="flex items-center gap-2">
                        <PinOff size={24}/>
                        <label>Unpin from Start</label>
                    </div>
                </ContextMenuItem>
                <ContextMenuSeparator/>
                {app.path !== "" && (
                    <ContextMenuItem onClick={async () => await window.apps.openApp(app, true)}>
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={24}/>
                            <label>Open as Administrator</label>
                        </div>
                    </ContextMenuItem>
                )}
                {app.path && (
                    <ContextMenuItem onClick={() => window.file.openInExplorer(app.path!)}>
                        <div className="flex items-center gap-2">
                            <FolderOpen size={24}/>
                            <label>Open file location</label>
                        </div>
                    </ContextMenuItem>
                )}
                {app.path && <ContextMenuSeparator/>}
                <ContextMenuItem onClick={() => window.electron.openUninstall()}>
                    <div className="flex items-center gap-2">
                        <Trash2 size={24}/>
                        <label>Uninstall</label>
                    </div>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}