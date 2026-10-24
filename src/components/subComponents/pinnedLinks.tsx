import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";
import {useEffect, useState} from "react";
import {Globe} from "lucide-react";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {Kbd} from "@/components/ui/kbd.tsx";
import {cachedFavicon, linkFavicon} from "@/utils/linkFavicons.ts";
import {useEscapeBarrier} from "@/hooks/useEscape.ts";
interface IPinnedLinks{
    link:LinkShortcutType;
    removeLink:(link:string)=>void;
    setEditLink:()=>void;
    index:number;
}
function PinnedLinks({ link, removeLink, setEditLink, index }: IPinnedLinks) {
    const {name,shortcut} = link;
    // Remembered favicons draw on the first frame; see linkFavicons.ts.
    const [favicon, setFavicon] = useState<string | null>(() => cachedFavicon(link.shortcut) ?? null);
    const [showKbd, setShowKbd] = useState<boolean>(false);
    const [menuOpen, setMenuOpen] = useState(false);
    useEscapeBarrier(menuOpen);

    useEffect(() => {
        const onLoad = async () => {
            setFavicon(await linkFavicon(shortcut));
        };
        onLoad();
        // Ctrl is read off each keydown rather than tracked between events:
        // hiding Volt with Ctrl+Space sends the Ctrl keyup to another window,
        // and a remembered "held" flag then turned typing "7zip" into link 7.
        // Only the first nine have a number key.
        const numbered = index < 9;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Control" && numbered) setShowKbd(true);
            if (numbered && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
                && event.key === (index + 1).toString()) {
                event.preventDefault();
                window.electron.openExternal(shortcut);
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === "Control") setShowKbd(false);
        };
        const hideKbd = () => setShowKbd(false);

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", hideKbd);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", hideKbd);
        };
    }, [shortcut, index]);


    return (
        <ContextMenu onOpenChange={setMenuOpen}>
            <ContextMenuTrigger asChild>
                {/* A chip in the links dock: favicon and name, sized to its name. */}
                <div className="shrink-0">
                    <TooltipProvider delayDuration={500}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="h-7.5 flex items-center gap-1.5 pl-1.5 pr-2.5 rounded-lg text-12 text-tone-650 whitespace-nowrap transition-colors duration-150 cursor-pointer select-none hover:bg-fill-100 hover:text-tone-850 active:scale-95"
                                    onClick={() => window.electron.openExternal(shortcut)}
                                >
                                    <span className="relative shrink-0">
                                        {favicon ? (
                                            <img src={favicon} alt="" className="w-4.5 h-4.5 rounded-sm" />
                                        ) : (
                                            <Globe size={16} className="text-tone-400" />
                                        )}
                                        {/* Held Ctrl: which number opens it, floated on the
                                            favicon's corner like an app badge, the chip keeps
                                            its width, and it stays inside the dock's clip. */}
                                        {showKbd && (
                                            <Kbd className="absolute -right-2 -bottom-1.5 h-3.75 min-w-3.75 px-1 rounded-[5px] bg-tone-850 text-surface text-10 font-bold leading-none shadow-[0_1px_4px_var(--shadow-2)] animate-in fade-in zoom-in-75 duration-100">
                                                {index + 1}
                                            </Kbd>
                                        )}
                                    </span>
                                    <span className="max-w-30 truncate">{name}</span>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-surface/[0.98] border border-line-100 text-tone-700 text-11">
                                {shortcut}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="z-50">
                <ContextMenuItem
                    onSelect={() => {
                        setTimeout(()=>setEditLink(),0);
                    }}
                >
                    Edit
                </ContextMenuItem>

                <ContextMenuItem
                    onSelect={(e) => {
                        e.preventDefault();
                        removeLink(shortcut);
                    }}
                >
                    Remove
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export default function SortablePinnedLink({link, removeLink, setEditLink, index}: IPinnedLinks) {
    const {attributes, listeners, setNodeRef, transform, transition} = useSortable({id: link.shortcut});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="shrink-0">
            <PinnedLinks link={link} removeLink={removeLink} setEditLink={setEditLink} index={index}/>
        </div>
    );
}