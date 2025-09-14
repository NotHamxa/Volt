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