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
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import {useEscapeBarrier} from "@/hooks/useEscape.ts";
import {appLogo} from "@/utils/appLogos.ts";
interface IPinnedApp {
    app: SearchQueryT;
    unPinApp: (app: SearchQueryT) => void;
}

/** `id` is the pin's identity from the list — not the name, which two apps can share. */
export default function SortablePinnedApp({id, app, unPinApp}: IPinnedApp & {id: string}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({id});

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
    const [menuOpen, setMenuOpen] = useState(false);
    useEscapeBarrier(menuOpen);

    useEffect(() => {
        if (!app) return;
        let cancelled = false;
        appLogo(app).then(found => {
            if (found && !cancelled) setLogo(found);
        });
        return () => { cancelled = true; };
    }, [app]);

    return (
        <ContextMenu onOpenChange={setMenuOpen}>
            <ContextMenuTrigger>
                <TooltipProvider delayDuration={500}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                aria-label={`Open ${app.name}`}
                                className="flex items-center justify-start w-25 h-22.5 bg-transparent rounded-lg transition-all duration-300 cursor-pointer flex-col overflow-hidden text-center select-none pt-1.25 hover:bg-fill-140 active:scale-95"
                                onClick={async () => {
                                    await window.apps.openApp(app);
                                }}
                            >
                                {logo ? (
                                    <img className="w-9 h-9 object-contain" src={logo}/>
                                ) : (
                                    <AppWindowIcon size={36}/>
                                )}
                                <label className="mt-2 text-12 max-w-22.5 truncate">{app.name}</label>
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-surface/[0.98] border border-line-100 text-tone-700 text-11">
                            {app.name}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
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