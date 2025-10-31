import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";
import {useEffect, useState} from "react";
import {AppWindowIcon} from "lucide-react";
import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {Kbd} from "@/components/ui/kbd.tsx";
interface IPinnedLinks{
    link:LinkShortcutType;
    removeLink:(link:string)=>void;
    setEditLink:()=>void;
    index:number;
}
function PinnedLinks({ link, removeLink, setEditLink, index }: IPinnedLinks) {
    const {name,shortcut} = link;
    const [favicon, setFavicon] = useState<string | null>(null);
    const [showKbd, setShowKbd] = useState<boolean>(false);

    useEffect(() => {
        const onLoad = async () => {
            setFavicon(await window.apps.getLinkFavicon(shortcut));
        };
        onLoad();
        let ctrlPressed = false;
        const handleKeyDown = (event: KeyboardEvent) => {
            console.log(ctrlPressed);

            if (event.key === "Control") {
                ctrlPressed = true;
                setShowKbd(true);
            }
            if (ctrlPressed && event.key === (index + 1).toString()) {
                console.log("Open", shortcut);
                window.electron.openExternal(shortcut);
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === "Control") {
                ctrlPressed = false;
                setShowKbd(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [shortcut, index]);


    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className="relative group flex items-center justify-center"
                    style={{ width: "100px", height: "80px" }}
                >
                    {showKbd && (
                        <div className="absolute top-1 right-1.5 shadow-md transition">
                            <Kbd className="text-xs">{index + 1}</Kbd>
                        </div>
                    )}
                    <button
                        className="w-full h-full flex flex-col items-center justify-start pt-1 rounded-lg text-center transition-all duration-200 cursor-pointer select-none hover:bg-[#353737] active:scale-95"
                        onClick={() => window.electron.openExternal(shortcut)}
                    >
                        {favicon ? (
                            <img
                                src={favicon}
                                alt={`${name} favicon`}
                                className="w-8 h-8 mb-1"
                            />
                        ) : (
                            <AppWindowIcon size={40} />
                        )}
                        <span className="text-sm">{name}</span>
                    </button>
                    <button
                        className="absolute top-1 right-1 p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    ></button>
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
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <PinnedLinks link={link} removeLink={removeLink} setEditLink={setEditLink} index={index}/>
        </div>
    );
}