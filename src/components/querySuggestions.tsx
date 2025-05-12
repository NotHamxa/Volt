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
    FileCode, FileSpreadsheet, PinOff, Pin,
} from "lucide-react";
import { FaRegFilePdf, FaRegFileWord,FaRegFilePowerpoint  } from "react-icons/fa6";
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
}

type QueryComponentProps = {
    item: SearchQueryT;
    highlighted?: boolean;
    pinApp?:(app:SearchQueryT) => void;
    unPinApp?:(app:SearchQueryT) => void;
    isAppPinned?:boolean;
};
const getFileIcon = (path: string) => {
    console.log(path);
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
const isSameApp = (a: SearchQueryT, b: SearchQueryT) => {
    return (
        a.appId === b.appId &&
        a.path === b.path &&
        a.name === b.name &&
        a.type === b.type &&
        a.source === b.source
    );
};

export function QueryComponent({ item,
                                   highlighted = false,
                                   isAppPinned=false,
                                   pinApp = ()=>{},
                                   unPinApp = ()=>{}}: QueryComponentProps) {
    const { name, type, path } = item;

    const [hovered, setHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const isHighlighted = hovered || highlighted || isFocused;

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const [logo,setLogo] = useState<string>();
    useEffect(() => {
        const getLogo = async () =>{
            if (type==="app" && path){
                setLogo(await window.apps.getAppLogo(item))
            }
            else if (type==="app" && item.appId){
                setLogo(await window.apps.getUwpAppLogo(item.name))
                console.log("uwp app",item.name)
            }
            else {
                setLogo("")
            }
        }
        getLogo()
    }, [type,path]);
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
                        gap: "8px",
                        padding: "8px",
                        borderRadius: "8px",
                        background: isHighlighted ? "rgba(255, 255, 255, 0.1)" : "transparent",
                        userSelect: "none",
                        transition: "background 0.15s ease-in-out",
                        outline: isFocused ? "2px solid #3faffa" : "none",
                    }}
                >
                    {type === "app" && (
                        logo !== "" ? (
                            <img style={{ width: 24, height: 24 }} src={logo} />
                        ) : (
                            <AppWindowIcon size={24} />
                        )
                    )}
                    {type === "folder" && <Folder size={24} />}
                    {type === "file" && path && getFileIcon(path)}
                    <Label>{name}</Label>
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
                    <>
                        <ContextMenuItem onClick={async () => {
                            await window.apps.openApp(item,true);
                        }}>
                            Open as Administrator
                        </ContextMenuItem>
                        <ContextMenuSeparator/>
                    </>
                }
                {path && (
                    <ContextMenuItem onClick={() => {
                        window.file.openInExplorer(path);
                    }}>
                        Open file location
                    </ContextMenuItem>
                )}
                {path && (
                    <ContextMenuItem onClick={async () => {
                        await navigator.clipboard.writeText(path);
                    }}>
                        Copy path
                    </ContextMenuItem>
                )}
                {path && type!=="app" && (
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


export default function QuerySuggestions({ query }: IQuerySuggestions) {
    const [pinnedApps,setPinnedApps] = useState<SearchQueryT[]>([])

    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const [bestMatch, setBestMatch] = useState<SearchQueryT | null>(null);
    const [apps, setApps] = useState<SearchQueryT[]>([]);
    const [folders, setFolders] = useState<SearchQueryT[]>([]);
    const [files, setFiles] = useState<SearchQueryT[]>([]);


    const limitedApps = apps.length > 3 ? apps.slice(0, 3) : apps;
    const limitedFiles = files.length > 3 ? files.slice(0, 3) : files;
    const limitedFolders = folders.length > 3 ? folders.slice(0, 3) : folders;

    useEffect(() => {
        const getData = async ()=>{
            const queryData = await getQueryData({ query, setBestMatch });
            setApps(queryData.apps);
            setFolders(queryData.folders);
            setFiles(queryData.files);

        }
        getData();

    }, [query]);

    const allResults: SearchQueryT[] = [
        ...(bestMatch ? [bestMatch] : []),
        ...limitedApps,
        ...limitedFiles,
        ...limitedFolders,
    ];

    const handleKeyDown = async (e: KeyboardEvent) => {
        if (e.key === "ArrowDown" && focusedIndex < allResults.length - 1) {
            setFocusedIndex(prev => prev + 1);
        } else if (e.key === "ArrowUp" && focusedIndex > 0) {
            setFocusedIndex(prev => prev - 1);
        } else if (e.key === "Enter" && allResults[focusedIndex]) {
            const item = allResults[focusedIndex];
            if (item.type === "app") {
                await window.apps.openApp(item);
            } else if (item.path) {
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

    useEffect(() => {
        const getAppData = async () => {
            const pApps = await window.electronStore.get("pinnedApps")
            setPinnedApps(pApps?JSON.parse(pApps):[]);
        }
        getAppData()
    }, []);
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
            {allResults.length === 0 ? (
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

                    {limitedApps.length > 0 && (
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

                    {limitedFiles.length > 0 && (
                        <>
                            <div style={styles.label}>Files</div>
                            {limitedFiles.map((file, index) => (
                                <QueryComponent
                                    key={file.name}
                                    item={file}
                                    highlighted={focusedIndex === index + (bestMatch ? 1 : 0) + limitedApps.length}
                                />
                            ))}
                        </>
                    )}

                    {limitedFolders.length > 0 && (
                        <>
                            <div style={styles.label}>Folders</div>
                            {limitedFolders.map((folder, index) => (
                                <QueryComponent
                                    key={folder.name}
                                    item={folder}
                                    highlighted={
                                        focusedIndex ===
                                        index + (bestMatch ? 1 : 0) + limitedApps.length + limitedFiles.length
                                    }
                                />
                            ))}
                        </>
                    )}
                </>
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
