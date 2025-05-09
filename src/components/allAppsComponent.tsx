import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {useState} from "react";
import {Button} from "@/components/ui/button.tsx";
import {AppWindow, ChevronLeft, Pin, PinOff} from "lucide-react";
import {ScrollArea} from "@/components/ui/scroll-area.tsx";
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu.tsx";
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

    const isHighlighted = hovered || isFocused;

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const isAppPinned = (app: SearchQueryT): boolean => {
        return pinnedApps.some((a) => isSameApp(a, app));
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
                    <AppWindow size={24} />
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
