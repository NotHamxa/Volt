import React, {useEffect, useState} from "react";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {Button} from "@/components/ui/button.tsx";
import {ChevronRight, Plus} from "lucide-react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
} from "@dnd-kit/sortable";
import {showToast} from "@/components/toast.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";
import AddLinkShortcutModal from "@/components/modal/addLinkShortcutModal.tsx";
import EditLinkShortcutModal from "@/components/modal/editLinkShortcutModal.tsx";
import SortablePinnedLink from "@/components/subComponents/pinnedLinks.tsx";
import SortablePinnedApp from "@/components/subComponents/pinnedApps.tsx";

interface Props {
    setStage: (n: number) => void;
    unPinApp: (app: SearchQueryT) => void;
    apps:SearchQueryT[];
    pinnedApps: SearchQueryT[];
    setPinnedApps:React.Dispatch<React.SetStateAction<SearchQueryT[]>>;
}


export default function PinnedApps({setStage, unPinApp, apps, pinnedApps,setPinnedApps}: Props) {
    const [addShortcutOpenModal,setAddShortcutOpenModal] = useState<boolean>(false);
    const [editShortcutModalOpen, setEditShortcutModalOpen] = useState(false);

    const [linkShortcuts, setLinkShortcuts] = useState<LinkShortcutType[]>([]);
    const [editLinkShortcut,setEditLinkShortcut] = useState<LinkShortcutType | null>(null);

    useEffect(() => {
        const getSuggestedApps = async ()=>{
            const appStack = await window.electronStore.get("appLaunchStack")
            let appLaunchStack = []
            if (appStack!==null && appStack!==undefined){
                appLaunchStack = JSON.parse(appStack);
            }
            const sApps = []
            for (const appName of appLaunchStack){
                if (!(pinnedApps.some(app=>app.name===appName)) && sApps.length<7){
                    const app = apps.find(app=>app.name===appName);
                    sApps.push(app)
                }
            }
            // setSuggestedApps(sApps);
        }
        if (apps.length>0)
            getSuggestedApps();
    }, [apps,pinnedApps]);

    const openEditModal = (link:LinkShortcutType)=>{
        setEditLinkShortcut(link)
        setEditShortcutModalOpen(true);
    }
    useEffect(() => {
        const loadLinks = async ()=>{
            const data = await window.electronStore.get("linkShortcuts");
            const shortcuts = JSON.parse(data) ?? [];
            setLinkShortcuts(shortcuts as LinkShortcutType[]);
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
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const handleDragEnd = (event) => {
        const {active, over} = event;
        if (active.id !== over.id) {
            const oldIndex = pinnedApps.findIndex(app => app.name === active.id);
            const newIndex = pinnedApps.findIndex(app => app.name === over.id);
            const newOrder = arrayMove(pinnedApps, oldIndex, newIndex);
            setPinnedApps(newOrder);
            window.electronStore.set("pinnedApps", JSON.stringify(newOrder));
        }
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const handleLinksDragEnd = (event) => {
        const {active, over} = event;
        if (active.id !== over.id) {
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
            <div style={{height: "325px", display: "flex", flexDirection: "column"}}>
                <div style={{
                    display: "flex",
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "16px",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingRight: "10px",
                }}>
                    <span style={{margin: "0 12px"}}>Pinned Apps</span>
                    <Button
                        variant="ghost"
                        className="bg-[#2b2b2b] hover:bg-[#3a3a3a] text-white px-3 py-1 h-auto text-sm rounded-md flex items-center gap-1"
                        onClick={() => setStage(2)}
                    >
                        All
                        <ChevronRight className="w-3 h-3"/>
                    </Button>
                </div>
                {pinnedApps?.length > 0 ? (
                    <div style={{display: "flex", alignItems: "center", justifyContent: "center", width: "100%"}}>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={pinnedApps.map(app => app.name)} strategy={rectSortingStrategy}>
                                <div className="col-span-6 w-full flex flex-wrap gap-0 px-[20px] py-[10px]">
                                    {pinnedApps.map((app) => (
                                        <SortablePinnedApp key={app.name} app={app} unPinApp={unPinApp}/>
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>
                ) : (
                    <div style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}>
                        <label>No Apps Pinned</label>
                    </div>
                )}
            </div>
            <div style={{height: "100%", display: "flex", flexDirection: "column"}}>
                <div style={{
                    display: "flex",
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "16px",
                    justifyContent: "space-between",
                    paddingRight: "10px",
                }}>
                    <span style={{margin: "0 12px"}}>Links</span>
                    <Button
                        variant="ghost"
                        className="bg-[#2b2b2b] hover:bg-[#3a3a3a] text-white px-3 py-1 h-auto text-sm rounded-md flex items-center gap-1"
                        onClick={()=>{
                            if (linkShortcuts.length >= 8){
                                showToast("Limit","You can only add 8 shortcuts.");
                                return;
                            }
                            setAddShortcutOpenModal(true)
                        }}
                    >
                        Add
                        <Plus/>
                    </Button>
                </div>

                <div style={{height: "100%", display: "flex", flexDirection: "row", padding:"5px 20px", width:"100%"}}>
                    {linkShortcuts.length > 0 ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLinksDragEnd}>
                            <SortableContext items={linkShortcuts.map(link => link.shortcut)} strategy={rectSortingStrategy}>
                                <div className="col-span-8 w-full flex flex-wrap gap-0">
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
                        <div style={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center"}}>
                            <label>No Links Pinned</label>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}