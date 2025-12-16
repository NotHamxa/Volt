import { Label } from "@/components/ui/label.tsx";
import { CSSProperties, useEffect, useState } from "react";
import {
    Folder,
    File,
    AppWindowIcon,
    FileText,
    FileImage,
    FileVideo,
    FileAudio,
    FileArchive,
    FileCode, FileSpreadsheet, PinOff, Pin, Download, Monitor, Bolt
} from "lucide-react";
import { FaRegFilePdf, FaRegFileWord,FaRegFilePowerpoint,FaFolderOpen  } from "react-icons/fa6";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu.tsx";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {ScrollArea} from "@/components/ui/scroll-area.tsx";
import {getQueryData} from "@/scripts/query.ts";
import {showToast} from "@/components/toast.tsx";

interface IQuerySuggestions {
    query: string;
    searchFilters:boolean[]
}

type QueryComponentProps = {
    item: SearchQueryT;
    highlighted?: boolean;
    pinApp?:(app:SearchQueryT) => void;
    unPinApp?:(app:SearchQueryT) => void;
    isAppPinned?:boolean;
};
const getFileIcon = (path: string) => {
    const extension = path.split(".")[1];
    switch (extension.toLowerCase()) {
        case "txt":
        case "md":
            return <FileText size={24} />;
        case "jpg":
        case "jpeg":
        case "png":
        case "gif":
        case "webp":
            return <FileImage size={24} />;
        case "mp4":
        case "mkv":
        case "mov":
            return <FileVideo size={24} />;
        case "mp3":
        case "wav":
            return <FileAudio size={24} />;
        case "zip":
        case "rar":
        case "7z":
            return <FileArchive size={24} />;
        case "js":
        case "ts":
        case "html":
        case "css":
        case "json":
        case "py":
        case "cpp":
            return <FileCode size={24} />;
        case "xls":
        case "xlsx":
            return <FileSpreadsheet size={24} />;
        case "doc":
        case "docx":
            return <FaRegFileWord size={24} />;
        case "ppt":
        case "pptx":
            return <FaRegFilePowerpoint size={24} />;
        case "pdf":
            return <FaRegFilePdf size={24}/> ;
        default:
            return <File size={24} />;
    }
};
const getSpecialFolderIcon = (name:string)=>{
    switch (name) {
        case "Downloads":
            return <Download size={24}/>
        case "Documents":
            return <FaFolderOpen  size={24}/>
        case "Desktop":
            return <Monitor size={24}/>
        default:
            return <Folder size={24}/>
    }
}
function getParentFolders(p: string): string {
    const normalized = p.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);

    if (segments.length <= 2) {
        return segments[0] || '';
    }
    return "../"+segments.slice(segments.length - 3, segments.length - 1).join('/');
}

const isSameApp = (a: SearchQueryT, b: SearchQueryT) => {
    return (
        a.appId === b.appId &&
        a.path === b.path &&
        a.name === b.name &&
        a.type === b.type &&
        a.source === b.source
    );
};

export function QueryComponent({
                                   item,
                                   highlighted = false,
                                   isAppPinned=false,
                                   pinApp = ()=>{},
                                   unPinApp = ()=>{},
}: QueryComponentProps) {
    const { name, type, path } = item;

    const [hovered, setHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const isHighlighted = hovered || highlighted || isFocused;

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const [logo,setLogo] = useState<string>();

    const getLogo = async () => {
        if (item.path){
            const appLogo = await window.apps.getAppLogo(item);
            setLogo(appLogo);
        }
        else if(item.source==="UWP"){
            const appLogo = await window.apps.getUwpAppLogo(item)
            setLogo(appLogo);
        }
    };
    useEffect(() => {
        getLogo()
    },[item,path]);
    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <button
                    onClick={async () => {
                        if (type === "app") {
                            await window.apps.openApp(item);
                        } else if (path) {
                            window.file.openPath(path);
                        }
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
                        justifyContent: "space-between", // left and right
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background: isHighlighted ? "rgba(255, 255, 255, 0.1)" : "transparent",
                        userSelect: "none",
                        transition: "background 0.15s ease-in-out",
                        outline: isFocused ? "2px solid #3faffa" : "none",
                        gap: "12px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {type === "app" && (logo ? (
                            <img style={{ width: 24, height: 24, objectFit: 'contain' }} src={logo} />
                        ) : (
                            <AppWindowIcon size={24} />
                        ))}
                        {type === "folder" && (
                            item.source ? getSpecialFolderIcon(item.name) : <Folder size={24} />
                        )}
                        {type === "file" && path && getFileIcon(path)}
                        {type === "setting" && <Bolt size={24} />}
                        <Label>{name}</Label>
                    </div>
                    <Label style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
                        {type === "file" && path && getParentFolders(path)}
                    </Label>
                </button>

            </ContextMenuTrigger>
            <ContextMenuContent>
                {type==="app" && <>
                    <ContextMenuItem onClick={()=>{
                        if (isAppPinned) {
                            unPinApp(item);
                        }
                        else {
                            pinApp(item);
                        }
                    }}
                    >
                        {isAppPinned?
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
                </>}

                {type==="app" &&

                    <ContextMenuItem onClick={async () => {
                        await window.apps.openApp(item,true);
                    }}>
                        Open as Administrator
                    </ContextMenuItem>

                }
                {path && type!=="setting" && (
                    <>
                        <ContextMenuSeparator/>
                        <ContextMenuItem onClick={() => {
                            window.file.openInExplorer(path);
                        }}>
                            Open file location
                        </ContextMenuItem>
                    </>
                )}
                {path && type!=="setting" && (
                    <ContextMenuItem onClick={async () => {
                        await navigator.clipboard.writeText(path);
                    }}>
                        Copy path
                    </ContextMenuItem>
                )}
                {path && type!=="app" && type!=="setting" && (
                    <ContextMenuItem onClick={async () => {
                        window.file.openFileWith(path)
                    }}>
                        Open file with
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
}


export default function QuerySuggestions({ query, searchFilters }: IQuerySuggestions) {
    const [pinnedApps,setPinnedApps] = useState<SearchQueryT[]>([])

    const [isCmdCommand, setIsCmdCommand] = useState<boolean>(false)
    const [cmdCommand, setCmdCommand] = useState<string>("")

    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const [bestMatch, setBestMatch] = useState<SearchQueryT | null>(null);
    const [apps, setApps] = useState<SearchQueryT[]>([]);
    const [folders, setFolders] = useState<SearchQueryT[]>([]);
    const [files, setFiles] = useState<SearchQueryT[]>([]);
    const [settings, setSettings] = useState<SearchQueryT[]>([]);
    useEffect(() => {
        const getAppData = async () => {
            const pApps = await window.electronStore.get("pinnedApps")
            setPinnedApps(pApps?JSON.parse(pApps):[]);
        }
        getAppData()
    }, []);
    const searchOptionsSelected = searchFilters.filter(Boolean).length;
    const categories = [
        {name:"apps",item:apps},
        {name:"folders",item:folders},
        {name:"files",item:files},
        {name:"settings",item:settings},
    ]
    let limit = 3;
    let nullSets = 0;
    for (const category of categories) {
        if (category.item.length===0) nullSets++;
    }
    if (searchOptionsSelected === 3 || nullSets === 1){
        limit = 5;
    }
    if (searchOptionsSelected === 2 || nullSets === 2) {
        limit = 7;
    } else if (searchOptionsSelected === 1 || nullSets === 3) {
        const max = Math.max(apps.length,folders.length,files.length,settings.length)
        limit = max>15?15:max;
    }
    const limitedApps = apps.slice(0, limit);
    const limitedFiles = files.slice(0, limit);
    const limitedFolders = folders.slice(0, limit);
    const limitedSettings = settings.slice(0, limit);
    useEffect(() => {
        const words = query.trim().split(" ");
        const lastWord = words[words.length - 1];
        const hasBang = lastWord.startsWith("!cmd");
        const searchTerm = hasBang ? words.slice(0, -1).join(" ") : query;
        setIsCmdCommand(hasBang);
        const getData = async ()=>{
            const queryData = await getQueryData({
                query:query.trim(),
                setBestMatch,
                searchQueryFilters:searchFilters
            });
            console.log(queryData);
            setApps(queryData.apps);
            setFolders(queryData.folders);
            setFiles(queryData.files);
            setSettings(queryData.settings);

        }
        if (hasBang){
            setCmdCommand(searchTerm)
            return;
        }
        else{
            getData();
        }
    }, [query,searchFilters]);

    const allResults: SearchQueryT[] = [
        ...(bestMatch ? [bestMatch] : []),
        ...limitedApps,
        ...limitedSettings,
        ...limitedFiles,
        ...limitedFolders,
    ];

    const handleKeyDown = async (e: KeyboardEvent) => {
        if (e.key === "ArrowDown" && focusedIndex < allResults.length - 1) {
            setFocusedIndex(prev => prev + 1);
        } else if (e.key === "ArrowUp" && focusedIndex > 0) {
            setFocusedIndex(prev => prev - 1);
        }
        else if (e.key === "Enter" && isCmdCommand) {
            window.electron.executeCmd(cmdCommand);
        }
        else if (e.key === "Enter" && allResults[focusedIndex]) {
            const item = allResults[focusedIndex];
            if (item.type === "app") {
                await window.apps.openApp(item);
            }
            else if (item.path) {
                window.file.openPath(item.path);
            }
        }

    };

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [focusedIndex, allResults]);


    const pinApp = async (app: SearchQueryT) => {
        if (pinnedApps.length === 21) {
            showToast("Maximum Pins Reached", "You can pin up to 21 apps only.");
            return;
        }
        if (!pinnedApps.find((a) => isSameApp(a, app))) {
            const updated = [...pinnedApps, app];
            window.electronStore.set("pinnedApps", JSON.stringify(updated));
            setPinnedApps(updated);
        }
    };
    const unPinApp = async (app: SearchQueryT) => {
        const updated = pinnedApps.filter((a) => !isSameApp(a, app));
        window.electronStore.set("pinnedApps", JSON.stringify(updated));
        setPinnedApps(updated);
    };
    const isAppPinned = (app: SearchQueryT): boolean => {
        return pinnedApps.some((a) => isSameApp(a, app));
    };

    return (
        <ScrollArea style={styles.mainContainer}>
            {isCmdCommand ? (
                <div>
                    <div style={{...styles.label,textAlign:"center"}}>CMD Command</div>
                    <div style={{
                        padding: "8px",
                        borderRadius: "8px",
                        background: "rgba(255, 255, 255, 0.05)"
                    }}>
                        {cmdCommand}
                    </div>
                </div>
            ) : (
                allResults.length === 0 ? (
                    <div>No results found</div>
                ) : (
                    <>
                        {bestMatch && (
                            <>
                                <div style={styles.label}>Best Match</div>
                                <QueryComponent
                                    item={bestMatch}
                                    highlighted={focusedIndex === 0}
                                    pinApp={pinApp}
                                    unPinApp={unPinApp}
                                    isAppPinned={bestMatch.type==="app"?isAppPinned(bestMatch):false}
                                />
                            </>
                        )}

                        {limitedApps.length > 0 && searchFilters[0] && (
                            <>
                                <div style={styles.label}>Applications</div>
                                {limitedApps.map((app, index) => (
                                    <QueryComponent
                                        key={app.name}
                                        item={app}
                                        highlighted={focusedIndex === index + (bestMatch ? 1 : 0)}
                                        isAppPinned={isAppPinned(app)}
                                        pinApp={pinApp}
                                        unPinApp={unPinApp}

                                    />
                                ))}
                            </>
                        )}

                        {limitedSettings.length > 0 && searchFilters[3] &&(
                            <>
                                <div style={styles.label}>Settings</div>
                                {limitedSettings.map((file, index) => (
                                    <QueryComponent
                                        key={file.name}
                                        item={file}
                                        highlighted={focusedIndex === index + (bestMatch ? 1 : 0) + limitedApps.length}

                                    />
                                ))}
                            </>
                        )}

                        {limitedFiles.length > 0 && searchFilters[1] &&  (
                            <>
                                <div style={styles.label}>Files</div>
                                {limitedFiles.map((file, index) => (
                                    <QueryComponent
                                        key={file.name}
                                        item={file}
                                        highlighted={focusedIndex ===
                                            index + (bestMatch ? 1 : 0) + limitedApps.length + limitedSettings.length}
                                    />
                                ))}
                            </>
                        )}

                        {limitedFolders.length > 0 && searchFilters[2] &&  (
                            <>
                                <div style={styles.label}>Folders</div>
                                {limitedFolders.map((folder, index) => (
                                    <QueryComponent
                                        key={folder.name}
                                        item={folder}
                                        highlighted={
                                            focusedIndex ===
                                            index + (bestMatch ? 1 : 0) + limitedApps.length + limitedFiles.length + limitedSettings.length
                                        }
                                    />
                                ))}
                            </>
                        )}
                    </>
                )
            )}
        </ScrollArea>
    );

}

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: "100%",
        height: "420px",
        padding: "0 16px",
        boxSizing: "border-box",
    },
    componentContainer: {
        display: "flex",
        flexDirection: "row",
        gap: "8px",
        alignItems: "flex-start",
    },
    label: {
        fontWeight: "bold",
        fontSize: "16px",
        marginBottom: "8px",
        color: "#333",
    },
};
