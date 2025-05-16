import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button.tsx";
import {AppWindowIcon, ChevronLeft, FolderOpen, Pin, PinOff, ShieldCheck, Trash2} from "lucide-react";
import {ScrollArea} from "@/components/ui/scroll-area.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu.tsx";
import {Label} from "@/components/ui/label.tsx";

const isSameApp = (a: SearchQueryT, b: SearchQueryT) => {
    return (
        a.appId === b.appId &&
        a.path === b.path &&
        a.name === b.name &&
        a.type === b.type &&
        a.source === b.source
    );
};

interface IAllAppsComponent {
    setStage: (n: number) => void;
    apps: SearchQueryT[];
    pinnedApps:SearchQueryT[];
    pinApp:(app:SearchQueryT) => void;
    unPinApp:(app:SearchQueryT) => void;
}

interface IApp{
    app:SearchQueryT;
    pinnedApps:SearchQueryT[];
    pinApp:(app:SearchQueryT) => void;
    unPinApp:(app:SearchQueryT) => void;

}
function App({app,pinnedApps,pinApp,unPinApp}:IApp) {
    const [hovered, setHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [logo, setLogo] = useState<string>("");
    useEffect(() => {
        getLogo()
    }, [app]);

    const isHighlighted = hovered || isFocused;
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const isAppPinned = (app: SearchQueryT): boolean => {
        return pinnedApps.some((a) => isSameApp(a, app));
    };

    const getLogo = async () => {
        if (app.path){
            const appLogo = await window.apps.getAppLogo(app);
            setLogo(appLogo);
        }
        else if(app.source==="UWP"){
            const appLogo = await window.apps.getUwpAppLogo(app)
            setLogo(appLogo);
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <button
                    onClick={async () => {
                        await window.apps.openApp(app);

                    }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    tabIndex={0}
                    style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px",
                        borderRadius: "8px",
                        background: isHighlighted ? "rgba(255, 255, 255, 0.1)" : "transparent",
                        userSelect: "none",
                        transition: "background 0.15s ease-in-out",
                        outline: isFocused ? "2px solid #3faffa" : "none",
                    }}
                >
                    {logo?<img style={{width:24,height:24,objectFit: 'contain'}} src={logo}/>:<AppWindowIcon size={24} />}
                    <Label>{app.name}</Label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={()=>{
                    if (isAppPinned(app)) {
                        unPinApp(app);
                    }
                    else {
                        pinApp(app);
                    }
                }}
                >
                    {isAppPinned(app)?
                        // App pinned
                        <>
                            <PinOff size={24}/>
                            Unpin from Start
                        </>
                        :
                        // App not pinned
                        <>
                            <Pin size={24}/>
                            Pin to Start
                        </>
                    }
                </ContextMenuItem>
                <ContextMenuSeparator/>
                {app.path!==""?
                    <ContextMenuItem onClick={async ()=>{
                        await window.apps.openApp(app,true)
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
                            if (app.path)
                                window.file.openInExplorer(app.path)
                        }}
                    >
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <FolderOpen size={24}/>
                            <label>Open file location</label>
                        </div>
                    </ContextMenuItem>
                    :null}

                {app.path && <ContextMenuSeparator/>}
                <ContextMenuItem
                    onClick={()=>{
                        window.electron.openUninstall()
                    }}
                >
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Trash2 size={24}/>
                        <label>Uninstall</label>
                    </div>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}



export default function AllApps({setStage, apps,pinnedApps,pinApp,unPinApp}:IAllAppsComponent) {
    return (
        <div style={{height: "100%", display: "flex", flexDirection: "column"}}>
            <div style={{
                display: "flex",
                color: "#ffffff",
                fontWeight: "bold",
                fontSize: "16px",
                alignItems: "center",
                justifyContent: "space-between",
                paddingRight: "10px",
            }}>
                <span style={{margin: "0 12px"}}>All</span>
                <Button
                    variant="ghost"
                    className="bg-[#2b2b2b] hover:bg-[#3a3a3a] text-white px-3 py-1 h-auto text-sm rounded-md flex items-center gap-1"
                    onClick={() => {
                        setStage(1)
                    }}
                >
                    <ChevronLeft className="w-3 h-3"/>
                    Back</Button>
            </div>
            <ScrollArea style={{width: "100%",
                height: "400px",
                padding: "0 16px",
                boxSizing: "border-box"
            }}>
                {Object.entries(
                    apps.reduce((acc: { [key: string]: SearchQueryT[] }, app) => {
                        const firstLetter = app.name[0].toUpperCase();
                        if (!acc[firstLetter]) acc[firstLetter] = [];
                        acc[firstLetter].push(app);
                        return acc;
                    }, {})
                ).sort(([a], [b]) => a.localeCompare(b))
                    .map(([letter, group]) => (
                        <div key={letter} style={{marginBottom: "16px"}}>
                            <div style={{
                                fontWeight: "bold",
                                color: "#ffffff",
                                fontSize: "14px",
                                marginBottom: "8px"
                            }}>
                                {letter}
                            </div>
                            {group.map(app => (
                                <div key={app.name}>
                                    <App
                                        app={app}
                                        pinnedApps={pinnedApps}
                                        pinApp={pinApp}
                                        unPinApp={unPinApp}
                                    />
                                </div>

                            ))}
                        </div>
                    ))}
            </ScrollArea>
        </div>
    )
}
