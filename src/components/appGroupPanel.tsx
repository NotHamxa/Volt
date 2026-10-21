import {useCallback, useEffect, useRef, useState} from "react";
import {closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors} from "@dnd-kit/core";
import {arrayMove, rectSortingStrategy, SortableContext} from "@dnd-kit/sortable";
import {FolderMinus, Ungroup, X} from "lucide-react";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {ContextMenuItem} from "@/components/ui/context-menu.tsx";
import SortablePinnedApp from "@/components/subComponents/pinnedApps.tsx";
import {useEscape} from "@/hooks/useEscape.ts";
import {useEdgeFade} from "@/hooks/useEdgeFade.ts";
import {appKey} from "@/utils/appUtils.ts";
import {AppGroup} from "@/utils/appGroups.ts";

interface Props {
    group: AppGroup;
    apps: SearchQueryT[];
    /** Opened to name it: the title starts selected. */
    renaming: boolean;
    unPinApp: (app: SearchQueryT) => void;
    onClose: () => void;
    onRename: (name: string) => void;
    onReorder: (keys: string[]) => void;
    onRemove: (app: SearchQueryT) => void;
    onUngroup: () => void;
}

/**
 * An open group, laid over the pinned apps. Its apps launch, reorder and
 * leave the group from here; Esc or a click outside closes it.
 */
export default function AppGroupPanel({group, apps, renaming, unPinApp, onClose, onRename, onReorder, onRemove, onUngroup}: Props) {
    const [name, setName] = useState(group.name);
    const inputRef = useRef<HTMLInputElement>(null);
    // Set by Esc so the blur that follows doesn't save what was abandoned.
    const cancelledRef = useRef(false);
    // Esc while naming abandons the edit; otherwise it closes the panel.
    // Decided here because the escape stack sees the key before the input.
    const onEscape = useCallback(() => {
        if (document.activeElement === inputRef.current) {
            cancelledRef.current = true;
            setName(group.name);
            inputRef.current?.blur();
        } else {
            onClose();
        }
    }, [group.name, onClose]);
    useEscape(onEscape, true);
    const {attach, onScroll, style: fadeStyle} = useEdgeFade<HTMLDivElement>("y");

    useEffect(() => {
        if (!renaming) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [renaming]);

    const commitName = () => {
        if (cancelledRef.current) { cancelledRef.current = false; return; }
        const next = name.trim();
        if (next && next !== group.name) onRename(next);
        else setName(group.name);
    };

    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 5}}));
    const onDragEnd = ({active, over}: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const keys = apps.map(appKey);
        onReorder(arrayMove(keys, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))));
    };

    return (
        <div className="absolute inset-0 z-20" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="absolute inset-x-3 inset-y-1 flex flex-col rounded-2xl border border-line-090 bg-surface-menu/[0.97] backdrop-blur-xl shadow-[0_14px_40px_var(--shadow-2)] animate-in fade-in zoom-in-[0.97] duration-150">
                <div className="shrink-0 flex items-center gap-2 pl-3 pr-2 pt-2.5 pb-1.5">
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        maxLength={40}
                        aria-label="Group name"
                        className="min-w-0 flex-1 px-1.5 py-0.5 -ml-1.5 rounded-md bg-transparent text-14 font-semibold text-tone-850 outline-none hover:bg-fill-050 focus:bg-fill-070"
                    />
                    <span className="shrink-0 text-11 tabular-nums text-tone-300">{apps.length} app{apps.length === 1 ? "" : "s"}</span>
                    <button
                        onClick={onUngroup}
                        title="Ungroup — the apps go back to the grid"
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-11 text-tone-400 hover:text-tone-800 hover:bg-fill-080 transition-colors cursor-pointer"
                    >
                        <Ungroup size={12}/> Ungroup
                    </button>
                    <button
                        onClick={onClose}
                        aria-label="Close group"
                        className="shrink-0 p-1.5 rounded-lg text-tone-400 hover:text-tone-800 hover:bg-fill-080 transition-colors cursor-pointer"
                    >
                        <X size={14}/>
                    </button>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={apps.map(appKey)} strategy={rectSortingStrategy}>
                        <div
                            ref={attach}
                            onScroll={onScroll}
                            style={fadeStyle}
                            className="flex-1 min-h-0 flex flex-wrap content-start px-3.5 pb-2 overflow-y-auto overscroll-contain scrollbar-thin-shadcn"
                        >
                            {apps.map(app => (
                                <SortablePinnedApp
                                    key={appKey(app)}
                                    id={appKey(app)}
                                    app={app}
                                    unPinApp={unPinApp}
                                    menu={
                                        <ContextMenuItem onClick={() => onRemove(app)}>
                                            <div className="flex items-center gap-2"><FolderMinus size={24}/><label>Remove from group</label></div>
                                        </ContextMenuItem>
                                    }
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
}
