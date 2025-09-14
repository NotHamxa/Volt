import React, {useEffect, useState} from "react";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {Button} from "@/components/ui/button.tsx";
import {AppWindowIcon, ChevronRight, FolderOpen, PinOff, Plus, ShieldCheck, Trash2} from "lucide-react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator
} from "@/components/ui/context-menu.tsx";
import {ContextMenuTrigger} from "@radix-ui/react-context-menu";
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
    useSortable,
} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {showToast} from "@/components/toast.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";
import AddLinkShortcutModal from "@/components/modal/addLinkShortcutModal.tsx";
import EditLinkShortcutModal from "@/components/modal/editLinkShortcutModal.tsx";

interface IPinnedSuggestedApps {
    setStage: (n: number) => void;
    unPinApp: (app: SearchQueryT) => void;
    apps:SearchQueryT[];
    pinnedApps: SearchQueryT[];
    setPinnedApps:React.Dispatch<React.SetStateAction<SearchQueryT[]>>;
}

interface IPinnedApp {
    app: SearchQueryT;
    unPinApp: (app: SearchQueryT) => void;
}
interface IPinnedLinks{
    link:LinkShortcutType;
    removeLink:(link:string)=>void;
    setEditLink:(link:LinkShortcutType | null)=>void;
}


function PinnedApp({app, unPinApp}: IPinnedApp) {
    const [logo, setLogo] = useState<string>("");

    const getLogo = async () => {
        if (app?.path) {
            const appLogo = await window.apps.getAppLogo(app);
            setLogo(appLogo);
        } else if (app?.source === "UWP") {
            const appLogo = await window.apps.getUwpAppLogo(app);
            setLogo(appLogo);
        }
    };

    useEffect(() => {
        getLogo();
        },[]);

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <button
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        width: '100px',
                        height: '90px',
                        backgroundColor: 'transparent',
                        borderRadius: '8px',
                        transition: 'background-color 0.3s ease, transform 0.1s ease',
                        cursor: 'pointer',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        textAlign: 'center',
                        userSelect: 'none',
                        paddingTop:"5px"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#353737'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    onClick={async () => {
                        await window.apps.openApp(app);
                    }}
                >
                    {logo ? (
                        <img style={{width: 36, height: 36, objectFit: 'contain'}} src={logo}/>
                    ) : (
                        <AppWindowIcon size={36}/>
                    )}
                    <label style={{marginTop: '8px', fontSize: '12px'}}>{app.name}</label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => unPinApp(app)}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <PinOff size={24}/>
                        <label>Unpin from Start</label>
                    </div>
                </ContextMenuItem>
                <ContextMenuSeparator/>
                {app.path !== "" && (
                    <ContextMenuItem onClick={async () => await window.apps.openApp(app, true)}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <ShieldCheck size={24}/>
                            <label>Open as Administrator</label>
                        </div>
                    </ContextMenuItem>
                )}
                {app.path && (
                    <ContextMenuItem onClick={() => window.file.openInExplorer(app.path!)}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <FolderOpen size={24}/>
                            <label>Open file location</label>
                        </div>
                    </ContextMenuItem>
                )}
                {app.path && <ContextMenuSeparator/>}
                <ContextMenuItem onClick={() => window.electron.openUninstall()}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Trash2 size={24}/>
                        <label>Uninstall</label>
                    </div>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

function SortablePinnedApp({app, unPinApp}: IPinnedApp) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({id: app.name});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <PinnedApp app={app} unPinApp={unPinApp}/>
        </div>
    );
}

export function PinnedLinks({ link, removeLink, setEditLink }: IPinnedLinks) {
    const {name,shortcut} = link;
    const getFaviconUrl = (url: string) => {
        try {
            const { hostname } = new URL(url);
            const parts = hostname.split('.');
            const baseDomain = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;

            return `https://www.google.com/s2/favicons?domain=${baseDomain}&sz=64`;
        } catch {
            return "";
        }
    };
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className="relative group"
                    style={{ width: "100px", height: "80px" }}
                >
                    <button
                        className="w-full h-full flex flex-col items-center justify-start pt-1 rounded-lg text-center transition-all duration-200 cursor-pointer select-none hover:bg-[#353737] active:scale-95"
                        onClick={() => window.electron.openExternal(shortcut)}
                    >
                        <img
                            src={getFaviconUrl(shortcut)}
                            alt={`${name} favicon`}
                            className="w-8 h-8 mb-1"
                        />
                        <span className="text-sm">{name}</span>
                    </button>
                    <button
                        className="absolute top-1 right-1 p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                    </button>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="z-50">
                <ContextMenuItem onClick={()=>setEditLink(link)}>Edit</ContextMenuItem>
                <ContextMenuItem onClick={()=>removeLink(shortcut)}>Remove</ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export default function PinnedApps({setStage, unPinApp, apps, pinnedApps,setPinnedApps}: IPinnedSuggestedApps) {
    const [addShortcutOpenModal,setAddShortcutOpenModal] = useState<boolean>(false);

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
    useEffect(() => {
        const loadLinks = async ()=>{
            const data = await window.electronStore.get("linkShortcuts");
            const shortcuts = JSON.parse(data) ?? [];
            setLinkShortcuts(shortcuts as LinkShortcutType[]);
        }
        loadLinks()
    }, []);
    const deleteLinkShortcut = async (link:string)=>{
        const shortcuts = linkShortcuts.filter(shortcut=>shortcut.shortcut!==link);
        window.electronStore.set("linkShortcuts",JSON.stringify(shortcuts));
        setLinkShortcuts(shortcuts)
        showToast("","Shortcut removed.")
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


    useEffect(() => {
        if (addShortcutOpenModal){
            window.dispatchEvent(new Event("shortcutModalOpen"));
        }
        else {
            window.dispatchEvent(new Event("shortcutModalClose"));
        }
    }, [addShortcutOpenModal]);

    return (
        <>
            <AddLinkShortcutModal
                addShortcutOpenModal={addShortcutOpenModal}
                setAddShortcutOpenModal={setAddShortcutOpenModal}
                linkShortcuts={linkShortcuts}
                setLinkShortcuts={setLinkShortcuts}
            />
            <EditLinkShortcutModal
                editLink={editLinkShortcut}
                setEditLink={setEditLinkShortcut}
                linkShortcuts={linkShortcuts}
                setLinkShortcuts={setLinkShortcuts}
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
                                setAddShortcutOpenModal(true)
                            }}
                    >
                        Add
                        <Plus/>
                    </Button>
                </div>
                <div style={{height: "100%", display: "flex", flexDirection: "row",padding:"5px 20px"}}>
                    {linkShortcuts.length > 0 ?
                        <>
                            {linkShortcuts.map(link => {
                                return <PinnedLinks
                                    link={link}
                                    removeLink={deleteLinkShortcut}
                                    setEditLink={setEditLinkShortcut}
                                />
                            })}
                        </> :
                        <div style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}>
                            <label>No Links Pinned</label>
                        </div>
                    }
                </div>
            </div>
        </>
    );
}
