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
    const [isFocused, setIsFocused] = useState(false);
    const [logo, setLogo] = useState<string>("");
    useEffect(() => {
        getLogo()
    }, [app]);

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
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    tabIndex={0}
                    className={`cursor-pointer flex items-center gap-2 p-2 rounded-lg select-none transition-colors duration-150 hover:bg-white/10 ${isFocused ? "bg-white/10 outline outline-2 outline-[#3faffa]" : "outline-none"}`}
                >
                    {logo ? <img className="w-6 h-6 object-contain" src={logo}/> : <AppWindowIcon size={24} />}
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
                        <>
                            <PinOff size={24}/>
                            Unpin from Start
                        </>
                        :
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
                        <div className="flex items-center gap-2">
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
                        <div className="flex items-center gap-2">
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
                    <div className="flex items-center gap-2">
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
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between pr-[10px]">
                <span className="mx-3 text-[11px] font-semibold tracking-[0.1em] uppercase text-white/25">All Apps</span>
                <Button
                    variant="ghost"
                    className="text-white/40 hover:text-white/70 px-2.5 py-1 h-auto text-xs rounded-lg flex items-center gap-1 transition-colors duration-150 bg-white/5 border border-white/8"
                    onClick={() => {
                        setStage(1)
                    }}
                >
                    <ChevronLeft className="w-3 h-3"/>
                    Back
                </Button>
            </div>
            <ScrollArea className="w-full h-[400px] px-4">
                {Object.entries(
                    apps.reduce((acc: { [key: string]: SearchQueryT[] }, app) => {
                        const firstLetter = app.name[0].toUpperCase();
                        if (!acc[firstLetter]) acc[firstLetter] = [];
                        acc[firstLetter].push(app);
                        return acc;
                    }, {})
                ).sort(([a], [b]) => a.localeCompare(b))
                    .map(([letter, group]) => (
                        <div key={letter} className="mb-4">
                            <div className="font-semibold text-white/20 text-[11px] tracking-[0.08em] uppercase mb-1.5 pl-2">
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
