import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";
interface IPinnedLinks{
    link:LinkShortcutType;
    removeLink:(link:string)=>void;
    setEditLink:(link:LinkShortcutType)=>void;
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
