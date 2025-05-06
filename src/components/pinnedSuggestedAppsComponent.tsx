import {useEffect, useState} from "react";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {Button} from "@/components/ui/button.tsx";
import {AppWindowIcon, ChevronRight, FolderOpen, PinOff, ShieldCheck, Trash2} from "lucide-react";
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator} from "@/components/ui/context-menu.tsx";
import {ContextMenuTrigger} from "@radix-ui/react-context-menu";


function PinnedApp({ app }: { app: SearchQueryT }) {
    const [logo,setLogo] = useState<string>("");
    useEffect(() => {
        console.log(app.appId)
        if (app.path) {
            const getLogo = async ()=>{
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                const appLogo = await window.electron.getAppLogo(app.path);
                console.log(appLogo);
                setLogo(appLogo);
            }
            getLogo()
            console.log()
        }
    }, []);
    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <button
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        width: '100px',
                        height: '85px',
                        backgroundColor: 'transparent',
                        borderRadius: '8px',
                        transition: 'background-color 0.3s ease, transform 0.1s ease',
                        cursor: 'pointer',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        textAlign: 'center',
                        userSelect: 'none',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#353737'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    onClick={async () => {
                        await window.electron.openApp(app);
                    }}
                >
                    {logo!==""?<img style={{width:36,height:36}} src={logo}/>:<AppWindowIcon size={36} />}

                    <label style={{ marginTop: '8px', fontSize: '12px' }}>{app.name}</label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <PinOff size={24}/>
                        <label>Unpin from Start</label>
                    </div>
                </ContextMenuItem>
                <ContextMenuSeparator/>
                {app.path!==""?
                    <ContextMenuItem onClick={async ()=>{
                        console.log("sadsadsad")
                        await window.electron.openApp(app,true)
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <ShieldCheck size={24}/>
                            <label>Open as Administrator</label>
                        </div>
                    </ContextMenuItem>
                    :null}

                {app.path?
                    <ContextMenuItem
                        onClick={() => {
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-expect-error
                            window.electron.openInExplorer(app.path)
                        }}
                    >
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <FolderOpen size={24}/>
                            <label>Open file location</label>
                        </div>
                    </ContextMenuItem>
                    :null}

                <ContextMenuSeparator/>
                <ContextMenuItem>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Trash2 size={24}/>
                        <label>Uninstall</label>
                    </div>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}


export default function PinnedSuggestedApps({setStage}: { setStage: (n: number) => void }) {
    const [pinnedApps, setPinnedApps] = useState<SearchQueryT[]>([])
    useEffect(() => {
        const getApps= async () => {
            const pinnedApps = await window.electronStore.get("pinnedApps")
            if (pinnedApps){
                setPinnedApps(JSON.parse(pinnedApps));
            }
            else {
                setPinnedApps([]);
            }
        }
        getApps()

    }, []);
    return (
        <>
            <div style={{height: "350px", display: "flex", flexDirection: "column" }}>
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
                        onClick={() => {
                            setStage(2)
                        }}
                    >
                        All
                        <ChevronRight className="w-3 h-3"/>
                    </Button>
                </div>
                {pinnedApps?.length > 0 ?
                    <div style={{display: "flex", alignItems: "center", justifyContent: "center", width: "100%"}}>
                        <div className="col-span-6 w-full flex flex-wrap gap-0 px-[20px] py-[10px]">
                            {pinnedApps?.map((app: SearchQueryT) => (
                                <PinnedApp app={app}/>
                            ))}
                        </div>
                    </div> :
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
            <div style={{height: "100%"}}>
                <div style={{
                    display: "flex",
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "16px",
                }}>
                <span style={{margin: "0 12px"}}>Suggested</span>
                </div>
                {/* Content below */}
            </div>
        </>
    )
}
