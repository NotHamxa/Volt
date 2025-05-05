import { Label } from "@/components/ui/label.tsx";
import { CSSProperties, useEffect, useState } from "react";
import {Folder, File, AppWindow} from "lucide-react";
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu.tsx";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {ScrollArea} from "@/components/ui/scroll-area.tsx";
import {getQueryData} from "@/scripts/query.ts";

interface IQuerySuggestions {
    query: string;
}

type QueryComponentProps = {
    item: SearchQueryT;
    highlighted?: boolean;
};

export function QueryComponent({ item, highlighted = false }: QueryComponentProps) {
    const { name, type, path } = item;

    const [hovered, setHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const isHighlighted = hovered || highlighted || isFocused;

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <button
                    onClick={async () => {
                        if (type === "app") {
                            await window.electron.openApp(item);
                        } else if (path) {
                            window.electron.openPath(path);
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
                    {type === "app" && <AppWindow size={24} />}
                    {type === "folder" && <Folder size={24} />}
                    {type === "file" && <File size={24} />}
                    <Label>{name}</Label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={async () => {
                    if (type === "app") {
                        await window.electron.openApp(item);

                    } else if (path) {
                        window.electron.openPath(path);
                    }
                }}>
                    Open
                </ContextMenuItem>
                {path && (
                    <ContextMenuItem onClick={() => {
                        window.electron.openInExplorer(path);
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
            </ContextMenuContent>
        </ContextMenu>
    );
}


export default function QuerySuggestions({ query }: IQuerySuggestions) {
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
                await window.electron.openApp(item);
            } else if (item.path) {
                window.electron.openPath(item.path);
            }
        }
    };

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [focusedIndex, allResults]);

    return (
        <ScrollArea style={styles.mainContainer}>
            {allResults.length === 0 ? (
                <div>No results found</div>
            ) : (
                <>
                    {bestMatch && (
                        <>
                            <div style={styles.label}>Best Match</div>
                            <QueryComponent item={bestMatch} highlighted={focusedIndex === 0} />
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
