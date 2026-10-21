import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {Button} from "@/components/ui/button.tsx";
import {ChevronRight, FolderPlus, Folders, Link2, Plus} from "lucide-react";
import {
    CollisionDetection,
    DndContext,
    DragEndEvent,
    DragMoveEvent,
    DragOverlay,
    DragStartEvent,
    MeasuringStrategy,
    closestCenter,
    pointerWithin,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    horizontalListSortingStrategy,
    SortableContext,
} from "@dnd-kit/sortable";
import {LinkShortcutType} from "@/interfaces/links.ts";
import AddLinkShortcutModal from "@/components/modal/addLinkShortcutModal.tsx";
import EditLinkShortcutModal from "@/components/modal/editLinkShortcutModal.tsx";
import SortablePinnedLink from "@/components/subComponents/pinnedLinks.tsx";
import SortablePinnedApp, {PinnedAppGhost} from "@/components/subComponents/pinnedApps.tsx";
import SortablePinnedGroup, {PinnedGroupGhost} from "@/components/subComponents/pinnedGroup.tsx";
import AppGroupPanel from "@/components/appGroupPanel.tsx";
import {
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from "@/components/ui/context-menu.tsx";
import {AppGroup, flatten, HomeItem, homeItems, liveGroups, loadGroups, rememberedGroups, saveGroups} from "@/utils/appGroups.ts";
import {appKey as pinId} from "@/utils/appUtils.ts";
import {APP_TILE} from "@/utils/homeTiles.ts";
import {useEdgeFade} from "@/hooks/useEdgeFade.ts";

interface Props {
    setStage: (n: number) => void;
    unPinApp: (app: SearchQueryT) => void;
    pinnedApps: SearchQueryT[];
    setPinnedApps:React.Dispatch<React.SetStateAction<SearchQueryT[]>>;
}

/**
 * The links as last loaded, for the life of the window: coming back to the
 * home screen starts from these, so the dock doesn't flash empty first.
 */
let rememberedLinks: LinkShortcutType[] | null = null;

/** Vertical padding inside the app grid, top and bottom together. */
const GRID_PAD_Y = 4;

/** How long the pointer rests on a tile's edge before the grid makes room there. */
const REORDER_DWELL_MS = 260;

/** The tile actually under the pointer; the nearest one when it's in a gap. */
const pointerFirst: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
};

/** The home grid moves tiles by reordering them, not by sliding pictures of them. */
const noShift = () => null;

/**
 * Where on a tile a dragged app has to be held to drop *into* it rather than
 * beside it. On an app, the middle half — making a group should be meant.
 * On a group, nearly all of it: adding to one is what dropping there means,
 * and only the outermost edge still nudges the grid to reorder.
 */
function inMergeZone(x: number, y: number, r: { left: number; top: number; width: number; height: number }, group: boolean) {
    const mx = group ? 0.1 : 0.25;
    const my = group ? 0.08 : 0.2;
    return x > r.left + r.width * mx && x < r.left + r.width * (1 - mx)
        && y > r.top + r.height * my && y < r.top + r.height * (1 - my);
}

/**
 * The home screen: pinned apps above, links in a dock along the bottom.
 *
 * Neither moves with the other. The dock is fixed to the bottom whatever is
 * pinned, so a link is always in the same place to reach for; the apps take
 * everything above it, in whole rows, and scroll a row at a time once there
 * are more than fit. An earlier version let the two share their space by
 * how full each was — which meant adding an app could push the links down,
 * and removing one pulled them up.
 */
export default function PinnedApps({setStage, unPinApp, pinnedApps,setPinnedApps}: Props) {
    const [addShortcutOpenModal,setAddShortcutOpenModal] = useState<boolean>(false);
    const [editShortcutModalOpen, setEditShortcutModalOpen] = useState(false);

    const [linkShortcuts, setLinkShortcuts] = useState<LinkShortcutType[]>(() => rememberedLinks ?? []);
    // Until the first read on a cold start, the dock shows nothing rather
    // than "no links yet" for a moment.
    const [linksLoaded, setLinksLoaded] = useState(() => rememberedLinks !== null);
    useEffect(() => { rememberedLinks = linkShortcuts; }, [linkShortcuts]);
    const [editLinkShortcut,setEditLinkShortcut] = useState<LinkShortcutType | null>(null);

    const openEditModal = (link:LinkShortcutType)=>{
        setEditLinkShortcut(link)
        setEditShortcutModalOpen(true);
    }
    useEffect(() => {
        const loadLinks = async ()=>{
            const data = await window.electronStore.get("linkShortcuts");
            let shortcuts: LinkShortcutType[] = [];
            try {
                const parsed = data ? JSON.parse(data) : [];
                if (Array.isArray(parsed)) shortcuts = parsed;
            } catch { /* a corrupt value shows as no links rather than a crash */ }
            setLinkShortcuts(shortcuts);
            setLinksLoaded(true);
        }
        loadLinks()
        window.addEventListener("reloadShortcuts", loadLinks);
        return () => window.removeEventListener("reloadShortcuts", loadLinks);
    }, []);
    const deleteLinkShortcut = async (link:string)=>{
        const shortcuts = linkShortcuts.filter(shortcut=>shortcut.shortcut!==link);
        window.electronStore.set("linkShortcuts",JSON.stringify(shortcuts));
        setLinkShortcuts(shortcuts)
    }

    // How many whole rows of apps fit between the header and the dock.
    // Measured from the space itself, never from what's pinned, so the
    // layout is the same with three apps as with thirty.
    const areaRef = useRef<HTMLDivElement>(null);
    const [rowsFit, setRowsFit] = useState(0);
    useLayoutEffect(() => {
        const area = areaRef.current;
        if (!area) return;
        const measure = () => setRowsFit(Math.max(1, Math.floor((area.clientHeight - GRID_PAD_Y) / APP_TILE.h)));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(area);
        return () => observer.disconnect();
    }, []);

    const { attach: attachApps, onScroll: onAppsScroll, style: appsFadeStyle } = useEdgeFade<HTMLDivElement>("y");
    const { attach: attachLinks, onScroll: onLinksScroll, style: linksFadeStyle } = useEdgeFade<HTMLDivElement>("x");

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    // --- groups --------------------------------------------------------------

    const [storedGroups, setStoredGroups] = useState<AppGroup[]>(() => rememberedGroups() ?? []);
    // On a cold start the grid waits for the one quick read, rather than
    // drawing grouped apps loose and folding them up a moment later.
    const [groupsLoaded, setGroupsLoaded] = useState(() => rememberedGroups() !== null);
    useEffect(() => {
        loadGroups().then(loaded => {
            setStoredGroups(loaded);
            setGroupsLoaded(true);
        });
    }, []);
    // Only what's still pinned: an app unpinned elsewhere leaves its group.
    const groups = useMemo(() => liveGroups(storedGroups, pinnedApps), [storedGroups, pinnedApps]);
    const items = useMemo(() => homeItems(pinnedApps, groups), [pinnedApps, groups]);
    const byKey = useMemo(() => new Map(pinnedApps.map(app => [pinId(app), app])), [pinnedApps]);
    // Each group's apps, computed once per change so a tile's icon preview
    // isn't refetched on every render.
    const members = useMemo(() => new Map(groups.map(g => [
        g.id,
        g.apps.map(k => byKey.get(k)).filter((a): a is SearchQueryT => Boolean(a)),
    ])), [groups, byKey]);
    const membersOf = (group: AppGroup) => members.get(group.id) ?? [];

    const [openGroup, setOpenGroup] = useState<{ id: string; renaming: boolean } | null>(null);

    /** Saves a new arrangement: the groups, and the flat pinned order they imply. */
    const commit = (nextItems: HomeItem[], nextGroups: AppGroup[]) => {
        const order = flatten(nextItems, nextGroups, pinnedApps);
        setStoredGroups(nextGroups);
        saveGroups(nextGroups);
        setPinnedApps(order);
        window.electronStore.set("pinnedApps", JSON.stringify(order));
    };

    /**
     * Puts `app` in a group: an existing one, or a new one standing where
     * `alongside` (or the app itself) stood.
     */
    const addToGroup = (app: SearchQueryT, groupId: string | null, alongside?: SearchQueryT) => {
        const key = pinId(app);
        // Out of any group it was in, and off the grid as a tile of its own.
        let nextGroups = groups.map(g => ({...g, apps: g.apps.filter(k => k !== key)}));
        let nextItems = items.filter(item => item.id !== key);
        if (groupId) {
            nextGroups = nextGroups.map(g => (g.id === groupId ? {...g, apps: [...g.apps, key]} : g));
        } else {
            const id = crypto.randomUUID();
            const anchor = alongside ?? app;
            const members = alongside ? [pinId(alongside), key] : [key];
            nextGroups = [
                ...nextGroups.map(g => ({...g, apps: g.apps.filter(k => !members.includes(k))})),
                {id, name: "New group", apps: members},
            ];
            // The new group takes the place of the tile it was made from.
            const at = Math.max(0, nextItems.findIndex(item => item.id === pinId(anchor)));
            nextItems = nextItems.filter(item => item.id !== pinId(anchor));
            nextItems.splice(Math.min(at, nextItems.length), 0, {kind: "group", id: `group:${id}`, groupId: id});
            setOpenGroup({id, renaming: true});
        }
        commit(nextItems, nextGroups.filter(g => g.apps.length > 0));
    };

    /** Takes `app` out of its group, onto the grid just after it. */
    const removeFromGroup = (app: SearchQueryT, groupId: string) => {
        const key = pinId(app);
        const nextGroups = groups.map(g => (g.id === groupId ? {...g, apps: g.apps.filter(k => k !== key)} : g));
        const nextItems = [...items];
        nextItems.splice(items.findIndex(item => item.id === `group:${groupId}`) + 1, 0, {kind: "app", id: key, app});
        if (!nextGroups.find(g => g.id === groupId)?.apps.length) setOpenGroup(null);
        commit(nextItems, nextGroups.filter(g => g.apps.length > 0));
    };

    /** Dissolves a group; its apps take its place on the grid, in its order. */
    const ungroup = (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        const nextItems = items.flatMap(item => (item.id === `group:${groupId}`
            ? membersOf(group).map(app => ({kind: "app" as const, id: pinId(app), app}))
            : [item]));
        setOpenGroup(null);
        commit(nextItems, groups.filter(g => g.id !== groupId));
    };

    const renameGroup = (groupId: string, name: string) => {
        const nextGroups = groups.map(g => (g.id === groupId ? {...g, name} : g));
        setStoredGroups(nextGroups);
        saveGroups(nextGroups);
    };

    const reorderGroup = (groupId: string, keys: string[]) => {
        commit(items, groups.map(g => (g.id === groupId ? {...g, apps: keys} : g)));
    };

    // --- dragging on the grid ----------------------------------------------
    //
    // Carrying a tile doesn't shift anything by itself, so you can take it
    // straight to another tile and drop it in: held over a tile's middle,
    // that tile lights up and letting go groups them. Resting over a tile's
    // edge for a moment makes room there instead. The tiles really move in
    // the page — not just their pictures — so what's under the pointer is
    // always what you see. (The first version shifted tiles the instant the
    // pointer touched them, so the one you were heading for slid away.)

    const [dragId, setDragId] = useState<string | null>(null);
    // The order while dragging: rearranged as room is made, saved on drop.
    const [dragOrder, setDragOrder] = useState<string[] | null>(null);
    const [mergeTarget, setMergeTarget] = useState<string | null>(null);
    const dwell = useRef<{ key: string; timer: number } | null>(null);
    const clearDwell = () => {
        if (dwell.current) window.clearTimeout(dwell.current.timer);
        dwell.current = null;
    };
    useEffect(() => clearDwell, []);

    const itemsById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
    const shown = dragOrder
        ? dragOrder.map(id => itemsById.get(id)).filter((item): item is HomeItem => Boolean(item))
        : items;

    const onGridDragStart = ({active}: DragStartEvent) => {
        setDragId(String(active.id));
        setDragOrder(items.map(item => item.id));
    };

    const onGridDragMove = ({active, over, delta, activatorEvent}: DragMoveEvent) => {
        const id = String(active.id);
        const pointer = activatorEvent as PointerEvent;
        const x = pointer.clientX + delta.x;
        const y = pointer.clientY + delta.y;
        if (!over || over.id === active.id) {
            clearDwell();
            if (mergeTarget) setMergeTarget(null);
            return;
        }
        const overId = String(over.id);
        // A group can't go inside anything; an app can go into an app or a group.
        if (!id.startsWith("group:") && inMergeZone(x, y, over.rect, overId.startsWith("group:"))) {
            clearDwell();
            if (mergeTarget !== overId) setMergeTarget(overId);
            return;
        }
        if (mergeTarget) setMergeTarget(null);

        // On an edge: room is made before or after that tile once the
        // pointer has rested there, not on the way past.
        const after = x > over.rect.left + over.rect.width / 2;
        const key = `${overId}|${after}`;
        if (dwell.current?.key === key) return;
        clearDwell();
        dwell.current = {
            key,
            timer: window.setTimeout(() => {
                dwell.current = null;
                setDragOrder(order => {
                    if (!order) return order;
                    const rest = order.filter(x => x !== id);
                    const at = rest.indexOf(overId);
                    if (at === -1) return order;
                    rest.splice(after ? at + 1 : at, 0, id);
                    return rest;
                });
            }, REORDER_DWELL_MS),
        };
    };

    const endDrag = () => {
        clearDwell();
        setDragId(null);
        setDragOrder(null);
        setMergeTarget(null);
    };

    const onGridDragEnd = ({active}: DragEndEvent) => {
        const target = mergeTarget;
        const order = dragOrder;
        endDrag();
        if (target) {
            const app = byKey.get(String(active.id));
            const onto = itemsById.get(target);
            if (app && onto?.kind === "group") addToGroup(app, onto.groupId);
            else if (app && onto?.kind === "app") addToGroup(app, null, onto.app);
            return;
        }
        if (order && order.join("\n") !== items.map(item => item.id).join("\n")) {
            commit(order.map(id => itemsById.get(id)).filter((item): item is HomeItem => Boolean(item)), groups);
        }
    };

    const dragged = dragId ? itemsById.get(dragId) : undefined;
    const openGroupData = openGroup ? groups.find(g => g.id === openGroup.id) ?? null : null;

    /** "Add to group" on an app tile's own menu: the precise way to do it. */
    const groupMenu = (app: SearchQueryT) => (
        <ContextMenuSub>
            <ContextMenuSubTrigger>
                <div className="flex items-center gap-2"><Folders size={24}/><label>Add to group</label></div>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
                {groups.map(g => (
                    <ContextMenuItem key={g.id} onClick={() => addToGroup(app, g.id)}>
                        <label className="max-w-48 truncate">{g.name}</label>
                    </ContextMenuItem>
                ))}
                {groups.length > 0 && <ContextMenuSeparator/>}
                <ContextMenuItem onClick={() => addToGroup(app, null)}>
                    <div className="flex items-center gap-2"><FolderPlus size={24}/><label>New group</label></div>
                </ContextMenuItem>
            </ContextMenuSubContent>
        </ContextMenuSub>
    );
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const handleLinksDragEnd = (event) => {
        const {active, over} = event;
        if (over && active.id !== over.id) {
            const oldIndex = linkShortcuts.findIndex(link => link.shortcut === active.id);
            const newIndex = linkShortcuts.findIndex(link => link.shortcut === over.id);
            const newOrder = arrayMove(linkShortcuts, oldIndex, newIndex);
            setLinkShortcuts(newOrder);
            window.electronStore.set("linkShortcuts", JSON.stringify(newOrder));
        }
    };
    useEffect(() => {
        if (addShortcutOpenModal){
            window.dispatchEvent(new Event("shortcutModalOpen"));
        }
        else {
            window.dispatchEvent(new Event("shortcutModalClose"));
        }
    }, [addShortcutOpenModal]);
    useEffect(() => {
        if (editShortcutModalOpen){
            window.dispatchEvent(new Event("shortcutModalOpen"));
        }
        else {
            window.dispatchEvent(new Event("shortcutModalClose"));
        }
    }, [editShortcutModalOpen]);

    return (
        <>
            <AddLinkShortcutModal
                addShortcutOpenModal={addShortcutOpenModal}
                setAddShortcutOpenModal={setAddShortcutOpenModal}
                linkShortcuts={linkShortcuts}
                setLinkShortcuts={setLinkShortcuts}
            />
            <EditLinkShortcutModal
                open={editShortcutModalOpen}
                setOpen={setEditShortcutModalOpen}
                editLink={editLinkShortcut}
                linkShortcuts={linkShortcuts}
            />
            <div className="flex-1 min-h-0 flex flex-col">
                <div data-walkthrough="pinned-apps" className="shrink-0 flex items-center justify-between pr-2.5">
                    <span className="mx-3 flex items-baseline gap-1.5 text-11 font-semibold tracking-widest uppercase text-tone-250">
                        Pinned apps
                        {pinnedApps.length > 0 && (
                            <span className="font-normal tracking-normal tabular-nums text-tone-200">{pinnedApps.length}</span>
                        )}
                    </span>
                    <Button
                        variant="ghost"
                        className="text-tone-400 hover:text-tone-700 px-2.5 py-1 h-auto text-xs rounded-lg flex items-center gap-1 transition-colors duration-150 bg-fill-050 border border-line-080"
                        onClick={() => setStage(2)}
                    >
                        All apps
                        <ChevronRight className="w-3 h-3"/>
                    </Button>
                </div>

                <div ref={areaRef} className="relative flex-1 min-h-0 flex flex-col">
                    {!groupsLoaded ? null : pinnedApps.length > 0 ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={pointerFirst}
                            // The tiles move in the page during a drag, so
                            // their positions are measured afresh as they do.
                            measuring={{droppable: {strategy: MeasuringStrategy.Always}}}
                            onDragStart={onGridDragStart}
                            onDragMove={onGridDragMove}
                            onDragEnd={onGridDragEnd}
                            onDragCancel={endDrag}
                        >
                            <SortableContext items={shown.map(item => item.id)} strategy={noShift}>
                                {/* Whole rows only, and a scroll snaps to the next. */}
                                <div
                                    ref={attachApps}
                                    onScroll={onAppsScroll}
                                    style={{ height: rowsFit * APP_TILE.h + GRID_PAD_Y, ...appsFadeStyle }}
                                    className="shrink-0 w-full flex flex-wrap content-start px-5 py-0.5 overflow-y-auto overscroll-contain snap-y snap-mandatory scroll-py-0.5 scrollbar-thin-shadcn"
                                >
                                    {shown.map((item) => {
                                        if (item.kind === "app") {
                                            return (
                                                <SortablePinnedApp
                                                    key={item.id}
                                                    id={item.id}
                                                    app={item.app}
                                                    unPinApp={unPinApp}
                                                    dropTarget={mergeTarget === item.id}
                                                    menu={groupMenu(item.app)}
                                                    ghosted
                                                />
                                            );
                                        }
                                        const group = groups.find(g => g.id === item.groupId);
                                        if (!group) return null;
                                        return (
                                            <SortablePinnedGroup
                                                key={item.id}
                                                id={item.id}
                                                group={group}
                                                apps={membersOf(group)}
                                                dropTarget={mergeTarget === item.id}
                                                onOpen={() => setOpenGroup({id: group.id, renaming: false})}
                                                onRename={() => setOpenGroup({id: group.id, renaming: true})}
                                                onUngroup={() => ungroup(group.id)}
                                                ghosted
                                            />
                                        );
                                    })}
                                </div>
                            </SortableContext>
                            {/* The tile under the cursor; its slot stays faint in the grid. */}
                            <DragOverlay dropAnimation={null}>
                                {dragged?.kind === "app" && <PinnedAppGhost app={dragged.app} merging={Boolean(mergeTarget)}/>}
                                {dragged?.kind === "group" && (() => {
                                    const group = groups.find(g => g.id === dragged.groupId);
                                    return group ? <PinnedGroupGhost group={group} apps={membersOf(group)}/> : null;
                                })()}
                            </DragOverlay>
                        </DndContext>
                    ) : (
                        <p className="flex-1 flex items-center justify-center text-12 text-tone-200">
                            Pin apps from search or All apps to keep them here
                        </p>
                    )}

                    {openGroupData && openGroup && (
                        <AppGroupPanel
                            key={openGroupData.id}
                            group={openGroupData}
                            apps={membersOf(openGroupData)}
                            renaming={openGroup.renaming}
                            unPinApp={unPinApp}
                            onClose={() => setOpenGroup(null)}
                            onRename={(name) => renameGroup(openGroupData.id, name)}
                            onReorder={(keys) => reorderGroup(openGroupData.id, keys)}
                            onRemove={(app) => removeFromGroup(app, openGroupData.id)}
                            onUngroup={() => ungroup(openGroupData.id)}
                        />
                    )}
                </div>

                {/* The links dock. Stops short of the tip button in the corner. */}
                <div data-walkthrough="links-dock" className="shrink-0 h-10 mx-3 mr-14 mb-2 flex items-center gap-1 rounded-xl border border-line-070 bg-fill-030 pl-2.5 pr-1">
                    <Link2 size={13} className="shrink-0 text-tone-250" aria-label="Links" />
                    {!linksLoaded ? <div className="flex-1"/> : linkShortcuts.length > 0 ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLinksDragEnd}>
                            <SortableContext items={linkShortcuts.map(link => link.shortcut)} strategy={horizontalListSortingStrategy}>
                                <div
                                    ref={attachLinks}
                                    onScroll={onLinksScroll}
                                    // A plain wheel scrolls the dock sideways —
                                    // it has nowhere to go up or down.
                                    onWheel={(e) => {
                                        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
                                    }}
                                    style={linksFadeStyle}
                                    className="flex-1 min-w-0 h-full flex items-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none]"
                                >
                                    {linkShortcuts.map((link, index) => (
                                        <SortablePinnedLink
                                            key={link.shortcut}
                                            link={link}
                                            removeLink={deleteLinkShortcut}
                                            setEditLink={() => openEditModal(link)}
                                            index={index}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    ) : (
                        <p className="flex-1 min-w-0 truncate pl-1 text-12 text-tone-200">
                            Your most-used sites go here — the first nine open with Ctrl + 1–9
                        </p>
                    )}
                    <button
                        onClick={() => setAddShortcutOpenModal(true)}
                        aria-label="Add a link"
                        title="Add a link"
                        className="shrink-0 w-7.5 h-7.5 flex items-center justify-center rounded-lg text-tone-400 hover:text-tone-800 hover:bg-fill-100 transition-colors cursor-pointer"
                    >
                        <Plus size={15} />
                    </button>
                </div>
            </div>
        </>
    );
}
