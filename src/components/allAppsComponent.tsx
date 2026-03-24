import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {useEffect, useMemo, useRef, useState} from "react";
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
import {isSameApp} from "@/utils/appUtils.ts";

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
    const scrollRef = useRef<HTMLDivElement>(null);

    const grouped = useMemo(() =>
        Object.entries(
            apps.reduce((acc: { [key: string]: SearchQueryT[] }, app) => {
                const firstLetter = app.name[0]?.toUpperCase() || "#";
                if (!acc[firstLetter]) acc[firstLetter] = [];
                acc[firstLetter].push(app);
                return acc;
            }, {})
        ).sort(([a], [b]) => a.localeCompare(b)),
    [apps]);

    const letters = useMemo(() => grouped.map(([l]) => l), [grouped]);

    const scrollToLetter = (letter: string) => {
        const el = scrollRef.current?.querySelector(`[data-letter="${letter}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between pr-[10px]">
                <div className="flex items-center gap-2">
                    <span className="mx-3 text-[11px] font-semibold tracking-[0.1em] uppercase text-white/25">All Apps</span>
                    <span className="text-[10px] text-white/15">{apps.length}</span>
                </div>
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
            <div className="flex flex-1 min-h-0">
                <ScrollArea className="w-full h-[400px] px-4" ref={scrollRef}>
                    {grouped.map(([letter, group]) => (
                        <div key={letter} className="mb-4" data-letter={letter}>
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
                <div className="flex flex-col items-center justify-center gap-0.5 pr-1 py-2">
                    {letters.map(l => (
                        <button
                            key={l}
                            onClick={() => scrollToLetter(l)}
                            className="text-[9px] text-white/20 hover:text-white/60 w-4 h-3.5 flex items-center justify-center rounded transition-colors"
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
