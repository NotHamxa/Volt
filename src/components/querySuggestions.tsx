import { Label } from "@/components/ui/label.tsx";
import { getNameFromPath } from "@/scripts/query.ts";
import { CSSProperties, useEffect, useState } from "react";
import {Folder,File} from "lucide-react";
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu.tsx";

interface IQuerySuggestions {
    bestMatch: string;
    apps: string[];
    files: string[];
    folders: string[];
}

interface QueryComponentProps {
    path: string;
    onClick?: (path: string) => void;
    highlighted?: boolean;
    type:string
}

export function QueryComponent({ path, highlighted = false, type }: QueryComponentProps) {
    const fileName = getNameFromPath(path);
    const [iconB64, setIconB64] = useState<string | null>(null);
    const [hovered, setHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        const fetchIcon = async () => {
            if (fileName.endsWith(".exe") || fileName.endsWith(".lnk")) {
                const icon = await window.electron.getFileIcon(path);
                setIconB64(icon);
            }
        };
        fetchIcon();
    }, [fileName, path]);

    const isHighlighted = hovered || highlighted || isFocused;

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <button
                    onClick={() => {
                        console.log("clicked", path);
                        window.electron.openPath(path);
                    }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    tabIndex={0}
                    style={{
                        ...styles.componentContainer,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px",
                        borderRadius: "8px",
                        background: isHighlighted ? "#b0b0b0" : "transparent",
                        userSelect: "none",
                        transition: "background 0.15s ease-in-out",
                        outline: isFocused ? "2px solid #3faffa" : "none",
                    }}
                >
                    {iconB64 ? <img src={iconB64} style={{ width: 24, height: 24 }} /> : null}
                    {type === "folder" ?<Folder size={24} />:null}
                    {type === "file" ?<File size={24} />:null}
                    <Label>{fileName}</Label>
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem>Open</ContextMenuItem>
                <ContextMenuItem>Open file location</ContextMenuItem>
                <ContextMenuItem onClick={async ()=>{
                    await navigator.clipboard.writeText(path);
                }}>Copy path</ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export default function QuerySuggestions({ bestMatch, apps, files, folders }: IQuerySuggestions) {
    const [focusedIndex, setFocusedIndex] = useState<number>(0);

    const limitedApps = apps.slice(0, 3);
    const limitedFiles = files.slice(0, 3);
    const limitedFolders = folders.slice(0, 3);

    const allResults = [
        { path: bestMatch, type: "bestMatch" },
        ...limitedApps.map(app => ({ path: app, type: "app" })),
        ...limitedFiles.map(file => ({ path: file, type: "file" })),
        ...limitedFolders.map(folder => ({ path: folder, type: "folder" })),
    ];

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowDown" && focusedIndex < allResults.length - 1) {
            setFocusedIndex(focusedIndex + 1);
        } else if (e.key === "ArrowUp" && focusedIndex > 0) {
            setFocusedIndex(focusedIndex - 1);
        }
        if (e.key === "Enter" && allResults[focusedIndex]) {
            window.electron.openPath(allResults[focusedIndex].path);
        }
    };

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [focusedIndex, allResults.length]);

    return (
        <div style={styles.mainContainer}>
            {allResults.length === 0 ? (
                <div>No results found</div>
            ) : (
                <>
                    {bestMatch !== "" && (
                        <>
                            <div style={styles.label}>Best Match</div>
                            <QueryComponent path={bestMatch} highlighted={focusedIndex === 0}
                                            type={"app"}
                            />
                        </>
                    )}
                    {limitedApps.length > 0 && (
                        <>
                            <div style={styles.label}>Applications</div>
                            {limitedApps.map((app, index) => (
                                <QueryComponent
                                    key={app}
                                    path={app}
                                    highlighted={focusedIndex === index + 1}
                                    type={"app"}
                                />
                            ))}
                        </>
                    )}
                    {limitedFiles.length > 0 && (
                        <>
                            <div style={styles.label}>Files</div>
                            {limitedFiles.map((file, index) => (
                                <QueryComponent
                                    key={file}
                                    path={file}
                                    highlighted={focusedIndex === limitedApps.length + index + 1}
                                    type={"file"}
                                />
                            ))}
                        </>
                    )}
                    {limitedFolders.length > 0 && (
                        <>
                            <div style={styles.label}>Folders</div>
                            {limitedFolders.map((folder, index) => (
                                <QueryComponent
                                    key={folder}
                                    path={folder}
                                    highlighted={focusedIndex === limitedApps.length + limitedFiles.length + index + 1}
                                    type={"folder"}
                                />
                            ))}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: "100%",
        height: "100%",
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
