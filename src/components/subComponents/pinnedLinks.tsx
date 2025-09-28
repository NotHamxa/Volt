import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";
import {useEffect, useState} from "react";
import {AppWindowIcon} from "lucide-react";
import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
interface IPinnedLinks{
    link:LinkShortcutType;
    removeLink:(link:string)=>void;
    setEditLink:()=>void;
}
function PinnedLinks({ link, removeLink, setEditLink }: IPinnedLinks) {
    const {name,shortcut} = link;
    const [favicon, setFavicon] = useState<string | null>(null);

    useEffect(() => {
        const onLoad = async ()=>{
            setFavicon(await window.apps.getLinkFavicon(shortcut))
        }
        onLoad()
    }, []);

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
                        {favicon!==null?
                            <img
                                src={favicon}
                                alt={`${name} favicon`}
                                className="w-8 h-8 mb-1"
                            />:
                            <AppWindowIcon size={40}/>
                        }

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

export default function SortablePinnedLink({link, removeLink, setEditLink}: IPinnedLinks) {
    const {attributes, listeners, setNodeRef, transform, transition} = useSortable({id: link.shortcut});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <PinnedLinks link={link} removeLink={removeLink} setEditLink={setEditLink} />
        </div>
    );
}