import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {useEffect, useState} from "react";
import {ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
    ContextMenuItem,
    ContextMenuSeparator} from "@/components/ui/context-menu.tsx";
import {AppWindowIcon, FolderOpen, PinOff, ShieldCheck, Trash2} from "lucide-react";
import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
interface IPinnedApp {
    app: SearchQueryT;
    unPinApp: (app: SearchQueryT) => void;
}

export default function SortablePinnedApp({app, unPinApp}: IPinnedApp) {
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
                    className="flex items-center justify-start w-[100px] h-[90px] bg-transparent rounded-lg transition-all duration-300 cursor-pointer flex-col overflow-hidden text-center select-none pt-[5px] hover:bg-[#353737] active:scale-95"
                    onClick={async () => {
                        await window.apps.openApp(app);
                    }}
                >
                    {logo ? (
                        <img className="w-9 h-9 object-contain" src={logo}/>
                    ) : (
                        <AppWindowIcon size={36}/>
                    )}
                    <label className="mt-2 text-[12px]">{app.name}</label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => unPinApp(app)}>
                    <div className="flex items-center gap-2">
                        <PinOff size={24}/>
                        <label>Unpin from Start</label>
                    </div>
                </ContextMenuItem>
                <ContextMenuSeparator/>
                {app.path !== "" && (
                    <ContextMenuItem onClick={async () => await window.apps.openApp(app, true)}>
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={24}/>
                            <label>Open as Administrator</label>
                        </div>
                    </ContextMenuItem>
                )}
                {app.path && (
                    <ContextMenuItem onClick={() => window.file.openInExplorer(app.path!)}>
                        <div className="flex items-center gap-2">
                            <FolderOpen size={24}/>
                            <label>Open file location</label>
                        </div>
                    </ContextMenuItem>
                )}
                {app.path && <ContextMenuSeparator/>}
                <ContextMenuItem onClick={() => window.electron.openUninstall()}>
                    <div className="flex items-center gap-2">
                        <Trash2 size={24}/>
                        <label>Uninstall</label>
                    </div>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}