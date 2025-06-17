import React, {useEffect, useState} from "react";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {Button} from "@/components/ui/button.tsx";
import {AppWindowIcon, ChevronRight, FolderOpen, Pin, PinOff, ShieldCheck, Trash2} from "lucide-react";
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

interface IPinnedSuggestedApps {
    setStage: (n: number) => void;
    unPinApp: (app: SearchQueryT) => void;
    pinApp: (app: SearchQueryT) => void;
    apps:SearchQueryT[];
    pinnedApps: SearchQueryT[];
    setPinnedApps:React.Dispatch<React.SetStateAction<SearchQueryT[]>>;
}

interface IPinnedApp {
    app: SearchQueryT;
    unPinApp: (app: SearchQueryT) => void;
}
interface ISuggestedApp{
    app: SearchQueryT;
    pinApp:(app: SearchQueryT) => void;
}

function SuggestedApp({app, pinApp}: ISuggestedApp) {
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
    },[app]);

    if (!app?.name || !app?.type){
        return
    }
    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <button
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        width: '100px',
                        height: '80px',
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
                        <img style={{width: 28, height: 28, objectFit: 'contain'}} src={logo}/>
                    ) : (
                        <AppWindowIcon size={28}/>
                    )}
                    <label style={{marginTop: '8px', fontSize: '12px'}}>{app.name}</label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => pinApp(app)}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Pin size={24}/>
                        <label>Pin to Start</label>
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

export default function PinnedApps({setStage, unPinApp, pinApp, apps, pinnedApps,setPinnedApps}: IPinnedSuggestedApps) {

    const [suggestedApps,setSuggestedApps] = useState<SearchQueryT[]>([]);

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
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            setSuggestedApps(sApps);
            console.log(sApps);
        }
        if (apps.length>0)
            getSuggestedApps();
    }, [apps,pinnedApps]);

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

    return (
        <>
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
                }}>
                    <span style={{margin: "0 12px"}}>Suggested</span>
                </div>
                <div style={{height: "100%", display: "flex", flexDirection: "row",padding:"10px 20px"}}>
                    {suggestedApps.length > 0 ?
                        <>
                            {suggestedApps.map(app => {
                                return <SuggestedApp app={app} pinApp={pinApp}/>
                            })}
                        </> :
                        <div style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}>
                            <label>No Apps Pinned</label>
                        </div>
                    }
                </div>
            </div>
        </>
    );
}
