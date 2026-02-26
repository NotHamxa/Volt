import { Label } from "@/components/ui/label.tsx";
import { CSSProperties, useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import {
    Folder,
    File,
    AppWindowIcon,
    FileText,
    FileImage,
    FileVideo,
    FileAudio,
    FileArchive,
    FileCode,
    FileSpreadsheet,
    PinOff,
    Pin,
    Download,
    Monitor,
    Bolt,
    ArrowDownToLine,
    CodeXml
} from "lucide-react";
import { FaRegFilePdf, FaRegFileWord, FaRegFilePowerpoint, FaFolderOpen } from "react-icons/fa6";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger
} from "@/components/ui/context-menu.tsx";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { getQueryData } from "@/scripts/query.ts";
import { showToast } from "@/components/toast.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";

interface IQuerySuggestions {
    query: string;
    searchFilters: boolean[]
}

type QueryComponentProps = {
    item: SearchQueryT;
    highlighted?: boolean;
    pinApp?: (app: SearchQueryT) => void;
    unPinApp?: (app: SearchQueryT) => void;
    isAppPinned?: boolean;
    triggerAction?: boolean;
    triggerContextMenu?: boolean;
    onContextMenuOpenChange?: (open: boolean) => void;
};

const getFileIcon = (path: string) => {
    const extension = path.split(".").pop()?.toLowerCase() || "";

    switch (extension) {
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
            return <FaRegFilePdf size={24} />;
        case "msi":
            return <ArrowDownToLine size={24} />
        default:
            return <File size={24} />;
    }
};

const getSpecialFolderIcon = (name: string) => {
    switch (name) {
        case "Downloads":
            return <Download size={24} />
        case "Documents":
            return <FaFolderOpen size={24} />
        case "Desktop":
            return <Monitor size={24} />
        default:
            return <Folder size={24} />
    }
}

function getParentFolders(p: string): string {
    const normalized = p.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);

    if (segments.length <= 2) {
        return segments[0] || '';
    }
    return "../" + segments.slice(segments.length - 3, segments.length - 1).join('/');
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

const QueryComponent = memo(({
                                 item,
                                 highlighted = false,
                                 isAppPinned = false,
                                 pinApp = () => { },
                                 unPinApp = () => { },
                                 triggerAction = false,
                                 triggerContextMenu = false,
                                 onContextMenuOpenChange,
                             }: QueryComponentProps) => {
    const { name, type, path } = item;

    const [hovered, setHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [logo, setLogo] = useState<string>();

    const triggerRef = useRef<HTMLSpanElement>(null);

    const isHighlighted = hovered || highlighted || isFocused;

    const handleFocus = useCallback(() => setIsFocused(true), []);
    const handleBlur = useCallback(() => setIsFocused(false), []);
    const handleMouseEnter = useCallback(() => setHovered(true), []);
    const handleMouseLeave = useCallback(() => setHovered(false), []);

    const getLogo = useCallback(async () => {
        if (item.path) {
            const appLogo = await window.apps.getAppLogo(item);
            setLogo(appLogo);
        } else if (item.source === "UWP") {
            const appLogo = await window.apps.getUwpAppLogo(item)
            setLogo(appLogo);
        }
    }, [item.path, item.source]);

    useEffect(() => {
        getLogo()
    }, [getLogo]);

    useEffect(() => {
        if (triggerAction && type === "commandConfirm") {
            setShowConfirmation(true);
        }
    }, [triggerAction, type]);

    useEffect(() => {
        if (triggerContextMenu && triggerRef.current) {
            const el = triggerRef.current;
            const rect = el.getBoundingClientRect();
            const event = new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
            });
            el.dispatchEvent(event);
        }
    }, [triggerContextMenu]);

    const handleClick = useCallback(async () => {
        if (type === "command") {
            await window.apps.executeCommand(item);
        } else if (type === "commandConfirm") {
            setShowConfirmation(true);
        } else if (type === "app") {
            await window.apps.openApp(item);
        } else if (path) {
            window.file.openPath(path);
        }
    }, [type, item, path]);

    const handleConfirm = useCallback(async () => {
        await window.apps.executeCommand(item);
        setShowConfirmation(false);
    }, [item]);

    const handleCancel = useCallback(() => {
        setShowConfirmation(false);
    }, []);

    const handlePinToggle = useCallback(() => {
        if (isAppPinned) {
            unPinApp(item);
        } else {
            pinApp(item);
        }
    }, [isAppPinned, item, pinApp, unPinApp]);

    const handleOpenAsAdmin = useCallback(async () => {
        await window.apps.openApp(item, true);
    }, [item]);

    const handleOpenInExplorer = useCallback(() => {
        if (path) window.file.openInExplorer(path);
    }, [path]);

    const handleCopyPath = useCallback(async () => {
        if (path) await navigator.clipboard.writeText(path);
    }, [path]);

    const handleOpenWith = useCallback(async () => {
        if (path) window.file.openFileWith(path);
    }, [path]);

    useEffect(() => {
        if (showConfirmation && highlighted) {
            const handleEnter = (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirm();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancel();
                }
            };
            window.addEventListener("keydown", handleEnter);
            return () => window.removeEventListener("keydown", handleEnter);
        }
    }, [showConfirmation, highlighted, handleConfirm, handleCancel]);

    const icon = useMemo(() => {
        if (type === "app") {
            return logo ? (
                <img
                    style={{ width: 24, height: 24, objectFit: "contain" }}
                    src={logo}
                    alt=""
                />
            ) : (
                <AppWindowIcon size={24} />
            );
        }
        if (type === "folder") {
            return item.source ? getSpecialFolderIcon(item.name) : <Folder size={24} />;
        }
        if (type === "file" && path) {
            return getFileIcon(path);
        }
        if (type === "setting") {
            return <Bolt size={24} />;
        }
        if (type === "command" || type === "commandConfirm") {
            return <CodeXml size={24} />;
        }
        return null;
    }, [type, logo, path, item.source, item.name]);

    const labelText = useMemo(() => {
        if (type === "file" && path) return getParentFolders(path);
        if (type === "app") return "Application";
        if (type === "setting") return "Setting";
        if (type === "command" || type === "commandConfirm") return "Command";
        return "";
    }, [type, path]);

    const buttonContent = (
        <button
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
            tabIndex={0}
            style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: "8px",
                background: isHighlighted ? "rgba(255, 255, 255, 0.1)" : "transparent",
                userSelect: "none",
                transition: "background 0.15s ease-in-out",
                outline: isFocused ? "2px solid #3faffa" : "none",
                gap: "12px",
                width: "100%"
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {icon}
                <Label>{name}</Label>
            </div>
            <Label
                style={{
                    marginLeft: "auto",
                    opacity: 0.7,
                    fontSize: 12,
                    cursor: "default",
                }}
            >
                {labelText}
            </Label>
        </button>
    );

    return (
        <>
            <ContextMenu onOpenChange={onContextMenuOpenChange}>
                <ContextMenuTrigger ref={triggerRef}>
                    <TooltipProvider>
                        <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                                {buttonContent}
                            </TooltipTrigger>
                            {type === "file" && path && (
                                <TooltipContent side={"top"}>
                                    <span>{path}</span>
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </TooltipProvider>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    {type === "app" && <>
                        <ContextMenuItem onClick={handlePinToggle}>
                            {isAppPinned ?
                                <>
                                    <PinOff size={24} />
                                    Unpin from Start
                                </>
                                :
                                <>
                                    <Pin size={24} />
                                    Pin to Start
                                </>
                            }
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                    </>}

                    {type === "app" &&
                        <ContextMenuItem onClick={handleOpenAsAdmin}>
                            Open as Administrator
                        </ContextMenuItem>
                    }
                    {path && type !== "setting" && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={handleOpenInExplorer}>
                                Open file location
                            </ContextMenuItem>
                        </>
                    )}
                    {path && type !== "setting" && (
                        <ContextMenuItem onClick={handleCopyPath}>
                            Copy path
                        </ContextMenuItem>
                    )}
                    {path && type !== "app" && type !== "setting" && (
                        <ContextMenuItem onClick={handleOpenWith}>
                            Open file with
                        </ContextMenuItem>
                    )}
                </ContextMenuContent>
            </ContextMenu>

            {type === "commandConfirm" && (
                <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
                    <DialogContent className="sm:max-w-[425px] bg-white text-black">
                        <DialogHeader>
                            <DialogTitle>Confirm Command</DialogTitle>
                            <DialogDescription className="text-gray-600">
                                Are you sure you want to run this command?
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <code className="block w-full p-3 bg-gray-100 rounded text-sm font-mono break-all">
                                {name}
                            </code>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={handleCancel}
                                className="bg-white text-black border-gray-300 hover:bg-gray-100"
                            >
                                Cancel (Esc)
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                className="bg-black text-white hover:bg-gray-800"
                            >
                                Run Command (Enter)
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.highlighted === nextProps.highlighted &&
        isSameApp(prevProps.item, nextProps.item) &&
        prevProps.isAppPinned === nextProps.isAppPinned &&
        prevProps.triggerAction === nextProps.triggerAction &&
        prevProps.triggerContextMenu === nextProps.triggerContextMenu
    );
});

export default function QuerySuggestions({ query, searchFilters }: IQuerySuggestions) {
    const [pinnedApps, setPinnedApps] = useState<SearchQueryT[]>([])
    const [isCmdCommand, setIsCmdCommand] = useState<boolean>(false)
    const [cmdCommand, setCmdCommand] = useState<string>("")
    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const [triggeredIndex, setTriggeredIndex] = useState<number>(-1);
    const [triggeredContextMenuIndex, setTriggeredContextMenuIndex] = useState<number>(-1);
    const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);
    const [bestMatch, setBestMatch] = useState<SearchQueryT | null>(null);
    const [apps, setApps] = useState<SearchQueryT[]>([]);
    const [folders, setFolders] = useState<SearchQueryT[]>([]);
    const [files, setFiles] = useState<SearchQueryT[]>([]);
    const [settings, setSettings] = useState<SearchQueryT[]>([]);
    const [commands, setCommands] = useState<SearchQueryT[]>([]);

    useEffect(() => {
        const getAppData = async () => {
            const pApps = await window.electronStore.get("pinnedApps")
            setPinnedApps(pApps ? JSON.parse(pApps) : []);
        }
        getAppData()
    }, []);

    const limit = useMemo(() => {
        const searchOptionsSelected = searchFilters.filter(Boolean).length;
        const categories = [apps, folders, files, settings, commands];
        const nullSets = categories.filter(cat => cat.length === 0).length;

        if ((searchOptionsSelected === 4 || searchOptionsSelected === 3) || nullSets === 1) return 5;
        if (searchOptionsSelected === 2 || nullSets === 2) return 7;
        if (searchOptionsSelected === 1 || nullSets === 3) {
            const max = Math.max(apps.length, folders.length, files.length, settings.length);
            return max > 15 ? 15 : max;
        }
        return 3;
    }, [searchFilters, apps.length, folders.length, files.length, settings.length, commands.length]);

    const limitedApps = useMemo(() => apps.slice(0, limit), [apps, limit]);
    const limitedFiles = useMemo(() => files.slice(0, limit), [files, limit]);
    const limitedFolders = useMemo(() => folders.slice(0, limit), [folders, limit]);
    const limitedSettings = useMemo(() => settings.slice(0, limit), [settings, limit]);
    const limitedCommands = useMemo(() => commands.slice(0, limit), [commands, limit]);

    useEffect(() => {
        const words = query.trim().split(" ");
        const lastWord = words[words.length - 1];
        const hasBang = lastWord.startsWith("!cmd");
        const searchTerm = hasBang ? words.slice(0, -1).join(" ") : query;
        setIsCmdCommand(hasBang);

        const getData = async () => {
            const queryData = await getQueryData({
                query: query.trim(),
                setBestMatch,
                searchQueryFilters: searchFilters
            });
            setApps(queryData.apps);
            setFolders(queryData.folders);
            setFiles(queryData.files);
            setSettings(queryData.settings);
            setCommands(queryData.commands)
        }

        if (hasBang) {
            setCmdCommand(searchTerm)
            return;
        } else {
            getData();
        }
    }, [query, searchFilters]);

    const allResults = useMemo<SearchQueryT[]>(() => [
        ...(bestMatch ? [bestMatch] : []),
        ...limitedApps,
        ...limitedSettings,
        ...limitedFiles,
        ...limitedFolders,
        ...limitedCommands,
    ], [bestMatch, limitedApps, limitedSettings, limitedFiles, limitedFolders, limitedCommands]);

    const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
        console.log(isContextMenuOpen)
        if (isContextMenuOpen) return;

        if (e.key === "ArrowDown" && focusedIndex < allResults.length - 1) {
            setFocusedIndex(prev => prev + 1);
        } else if (e.key === "ArrowUp" && focusedIndex > 0) {
            setFocusedIndex(prev => prev - 1);
        } else if (e.key === "Enter" && e.shiftKey && allResults[focusedIndex]) {
            e.preventDefault();
            setTriggeredContextMenuIndex(focusedIndex);
            setTimeout(() => setTriggeredContextMenuIndex(-1), 100);
        } else if (e.key === "Enter" && isCmdCommand) {
            window.electron.executeCmd(cmdCommand);
        } else if (e.key === "Enter" && allResults[focusedIndex]) {
            const item = allResults[focusedIndex];
            if (item.type === "command") {
                await window.apps.executeCommand(item);
            } else if (item.type === "commandConfirm") {
                e.preventDefault();
                setTriggeredIndex(focusedIndex);
                setTimeout(() => setTriggeredIndex(-1), 100);
            } else if (item.type === "app") {
                await window.apps.openApp(item);
            } else if (item.path) {
                window.file.openPath(item.path);
            }
        }
    }, [isContextMenuOpen, focusedIndex, allResults, isCmdCommand, cmdCommand]);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handleKeyDown]);

    const pinApp = useCallback(async (app: SearchQueryT) => {
        if (pinnedApps.length === 21) {
            showToast("Maximum Pins Reached", "You can pin up to 21 apps only.");
            return;
        }
        if (!pinnedApps.find((a) => isSameApp(a, app))) {
            const updated = [...pinnedApps, app];
            window.electronStore.set("pinnedApps", JSON.stringify(updated));
            setPinnedApps(updated);
        }
    }, [pinnedApps]);

    const unPinApp = useCallback(async (app: SearchQueryT) => {
        const updated = pinnedApps.filter((a) => !isSameApp(a, app));
        window.electronStore.set("pinnedApps", JSON.stringify(updated));
        setPinnedApps(updated);
    }, [pinnedApps]);

    const isAppPinned = useCallback((app: SearchQueryT): boolean => {
        return pinnedApps.some((a) => isSameApp(a, app));
    }, [pinnedApps]);

    return (
        <ScrollArea style={styles.mainContainer}>
            {isCmdCommand ? (
                <div>
                    <div style={{ ...styles.label, textAlign: "center" }}>CMD Command</div>
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
                            <QueryComponent
                                item={bestMatch}
                                highlighted={focusedIndex === 0}
                                pinApp={pinApp}
                                unPinApp={unPinApp}
                                isAppPinned={bestMatch.type === "app" ? isAppPinned(bestMatch) : false}
                                triggerAction={triggeredIndex === 0}
                                triggerContextMenu={triggeredContextMenuIndex === 0}
                                onContextMenuOpenChange={setIsContextMenuOpen}
                            />
                        )}

                        {limitedApps.length > 0 && searchFilters[0] && (
                            <>
                                {limitedApps.map((app, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0);
                                    return (
                                        <QueryComponent
                                            key={`${app.name}-${app.path}-${index}`}
                                            item={app}
                                            highlighted={focusedIndex === itemIndex}
                                            isAppPinned={isAppPinned(app)}
                                            pinApp={pinApp}
                                            unPinApp={unPinApp}
                                            triggerAction={triggeredIndex === itemIndex}
                                            triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                            onContextMenuOpenChange={setIsContextMenuOpen}
                                        />
                                    );
                                })}
                            </>
                        )}
                        {limitedCommands.length > 0 && searchFilters[4] && (
                            <>
                                {limitedCommands.map((command, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + limitedApps.length;
                                    return (
                                        <QueryComponent
                                            key={`${command.name}-${index}`}
                                            item={command}
                                            highlighted={focusedIndex === itemIndex}
                                            triggerAction={triggeredIndex === itemIndex}
                                            triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                            onContextMenuOpenChange={setIsContextMenuOpen}
                                        />
                                    );
                                })}
                            </>
                        )}
                        {limitedSettings.length > 0 && searchFilters[3] && (
                            <>
                                {limitedSettings.map((file, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + limitedCommands.length + limitedApps.length;
                                    return (
                                        <QueryComponent
                                            key={`${file.name}-${index}`}
                                            item={file}
                                            highlighted={focusedIndex === itemIndex}
                                            triggerAction={triggeredIndex === itemIndex}
                                            triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                            onContextMenuOpenChange={setIsContextMenuOpen}
                                        />
                                    );
                                })}
                            </>
                        )}

                        {limitedFiles.length > 0 && searchFilters[1] && (
                            <>
                                {limitedFiles.map((file, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + limitedCommands.length + limitedApps.length + limitedSettings.length;
                                    return (
                                        <QueryComponent
                                            key={`${file.name}-${file.path}-${index}`}
                                            item={file}
                                            highlighted={focusedIndex === itemIndex}
                                            triggerAction={triggeredIndex === itemIndex}
                                            triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                            onContextMenuOpenChange={setIsContextMenuOpen}
                                        />
                                    );
                                })}
                            </>
                        )}

                        {limitedFolders.length > 0 && searchFilters[2] && (
                            <>
                                {limitedFolders.map((folder, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + limitedApps.length + limitedCommands.length + limitedFiles.length + limitedSettings.length;
                                    return (
                                        <QueryComponent
                                            key={`${folder.name}-${folder.path}-${index}`}
                                            item={folder}
                                            highlighted={focusedIndex === itemIndex}
                                            triggerAction={triggeredIndex === itemIndex}
                                            triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                            onContextMenuOpenChange={setIsContextMenuOpen}
                                        />
                                    );
                                })}
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
    label: {
        fontWeight: "bold",
        fontSize: "16px",
        marginBottom: "8px",
        color: "#333",
    },
};