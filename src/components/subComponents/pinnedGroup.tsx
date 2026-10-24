import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {useEffect, useState} from "react";
import {AnimateLayoutChanges, useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {AppWindowIcon, FolderOpen, Pencil, Ungroup} from "lucide-react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import {useEscapeBarrier} from "@/hooks/useEscape.ts";
import {appLogo, cachedAppLogo} from "@/utils/appLogos.ts";
import {AppGroup} from "@/utils/appGroups.ts";

interface Props {
    id: string;
    group: AppGroup;
    apps: SearchQueryT[];
    /** Something is being held over it, and letting go adds it. */
    dropTarget: boolean;
    onOpen: () => void;
    onRename: () => void;
    onUngroup: () => void;
}

const slideWhileSorting: AnimateLayoutChanges = ({isSorting, wasDragging}) => isSorting || wasDragging;

/** A group on the home grid, sortable like an app. */
export default function SortablePinnedGroup(props: Props & { ghosted?: boolean }) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
        id: props.id,
        animateLayoutChanges: props.ghosted ? slideWhileSorting : undefined,
    });
    return (
        <div
            ref={setNodeRef}
            style={props.ghosted && isDragging ? {opacity: 0.25} : {transform: CSS.Transform.toString(transform), transition}}
            {...attributes}
            {...listeners}
            className="snap-start"
        >
            <PinnedGroup {...props}/>
        </div>
    );
}

/** The first four members' icons, two by two, enough to recognise it. */
function GroupPreview({apps}: {apps: SearchQueryT[]}) {
    const [logos, setLogos] = useState<string[]>(() => apps.slice(0, 4).map(app => cachedAppLogo(app) ?? ""));
    useEffect(() => {
        let cancelled = false;
        Promise.all(apps.slice(0, 4).map(app => appLogo(app).catch(() => ""))).then(found => {
            if (!cancelled) setLogos(found.map(l => l ?? ""));
        });
        return () => { cancelled = true; };
    }, [apps]);
    return (
        <div className="w-10 h-10 p-1 grid grid-cols-2 grid-rows-2 gap-0.5 place-items-center rounded-[11px] bg-fill-080 border border-line-080">
            {apps.slice(0, 4).map((_, i) => logos[i]
                ? <img key={i} src={logos[i]} alt="" className="w-3.75 h-3.75 object-contain"/>
                : <AppWindowIcon key={i} size={13} className="text-tone-400"/>)}
        </div>
    );
}

/** The group as it looks under the cursor while being dragged. */
export function PinnedGroupGhost({group, apps}: {group: AppGroup; apps: SearchQueryT[]}) {
    return (
        <div className="flex items-center justify-start w-25 h-22.5 rounded-lg flex-col overflow-hidden text-center select-none pt-1 bg-fill-100 shadow-[0_10px_28px_var(--shadow-2)] scale-105 cursor-grabbing">
            <GroupPreview apps={apps}/>
            <label className="mt-1.75 text-12 max-w-22.5 truncate">{group.name}</label>
        </div>
    );
}

function PinnedGroup({group, apps, dropTarget, onOpen, onRename, onUngroup}: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    useEscapeBarrier(menuOpen);
    return (
        <ContextMenu onOpenChange={setMenuOpen}>
            <ContextMenuTrigger>
                {/* 100 × 90, the same footprint as an app, APP_TILE. */}
                <button
                    aria-label={`Open group ${group.name}`}
                    title={`${group.name} (${apps.length} app${apps.length === 1 ? "" : "s"})`}
                    onClick={onOpen}
                    className={`flex items-center justify-start w-25 h-22.5 rounded-lg flex-col overflow-hidden text-center select-none pt-1 cursor-pointer transition-all duration-150 active:scale-95 ${
                        dropTarget ? "bg-fill-150 ring-2 ring-ink/25 scale-105" : "hover:bg-fill-140"
                    }`}
                >
                    <GroupPreview apps={apps}/>
                    <label className="mt-1.75 text-12 max-w-22.5 truncate pointer-events-none">{group.name}</label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onOpen}>
                    <div className="flex items-center gap-2"><FolderOpen size={24}/><label>Open</label></div>
                </ContextMenuItem>
                <ContextMenuItem onClick={onRename}>
                    <div className="flex items-center gap-2"><Pencil size={24}/><label>Rename</label></div>
                </ContextMenuItem>
                <ContextMenuSeparator/>
                <ContextMenuItem onClick={onUngroup}>
                    <div className="flex items-center gap-2"><Ungroup size={24}/><label>Ungroup</label></div>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
