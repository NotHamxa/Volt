import { Label } from "@/components/ui/label.tsx";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
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
    CodeXml,
    SearchX
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
import type { ProcessedQueryResult } from "@/scripts/query.ts";
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
import { Google } from "@/components/icons/google.tsx";
import { useEscapeBarrier } from "@/hooks/useEscape.ts";
import { tokenize } from "@/utils/tokenize.ts";
import { useOutletContext } from "react-router-dom";
import type { MainLayoutContext } from "@/pages/mainPage.tsx";

interface IQuerySuggestions {
    query: string;
    searchFilters: boolean[];
    clearQuery: () => void;
    logoMap: Map<string, string>;
}

type QueryComponentProps = {
    item: SearchQueryT;
    highlighted?: boolean;
    pinApp?: (app: SearchQueryT) => void;
    unPinApp?: (app: SearchQueryT) => void;
    isAppPinned?: boolean;
    logo?: string;
    triggerAction?: boolean;
    triggerContextMenu?: boolean;
    onContextMenuOpenChange?: (open: boolean) => void;
    onRequestRunCommand?: (item: SearchQueryT) => void;
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

const getLogoKey = (item: SearchQueryT) => `${item.path ?? ""}|${item.appId ?? ""}`;

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
                                 logo,
                                 pinApp = () => { },
                                 unPinApp = () => { },
                                 triggerAction = false,
                                 triggerContextMenu = false,
                                 onContextMenuOpenChange,
                                 onRequestRunCommand,
                             }: QueryComponentProps) => {
    const { name, type, path } = item;

    const [isFocused, setIsFocused] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);

    const triggerRef = useRef<HTMLSpanElement>(null);

    const handleFocus = useCallback(() => setIsFocused(true), []);
    const handleBlur = useCallback(() => setIsFocused(false), []);

    const isCommandType = type === "command" || type === "commandOpen" || type === "commandConfirm" || type === "commandConfirmOpen";
    const hasArgs = !!item.args && item.args.length > 0;

    useEffect(() => {
        if (triggerAction && (type === "commandConfirm" || type === "commandConfirmOpen") && !hasArgs) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShowConfirmation(true);
        }
    }, [triggerAction, type, hasArgs]);

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
        if (isCommandType && hasArgs && onRequestRunCommand) {
            onRequestRunCommand(item);
            return;
        }
        if (type === "command" || type === "commandOpen") {
            await window.apps.executeCommand(item);
        } else if (type === "commandConfirm" || type === "commandConfirmOpen") {
            setShowConfirmation(true);
        } else if (type === "app") {
            await window.apps.openApp(item);
        } else if (path) {
            window.file.openPath(path);
        }
    }, [type, item, path, isCommandType, hasArgs, onRequestRunCommand]);

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

    const handleCopyFile = useCallback(() => {
        if (path) window.file.copyFileToClipboard(path);
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
                <img className="w-6 h-6 object-contain" src={logo} alt="" />
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
        if (type === "command" || type === "commandConfirm" || type === "commandOpen" || type === "commandConfirmOpen") {
            return <CodeXml size={24} />;
        }
        return null;
    }, [type, logo, path, item.source, item.name]);

    const labelText = useMemo(() => {
        if (type === "file" && path) return getParentFolders(path);
        if (type === "app") return "Application";
        if (type === "setting") return "Setting";
        if (type === "commandOpen" || type === "commandConfirmOpen") return "Command (opens terminal)";
        if (type === "command" || type === "commandConfirm") return "Command";
        return "";
    }, [type, path]);

    const buttonContent = (
        <button
            onClick={handleClick}
            onFocus={handleFocus}
            onBlur={handleBlur}
            tabIndex={0}
            className={`cursor-pointer flex items-center justify-between py-2 px-3 rounded-lg select-none transition-colors duration-150 gap-3 w-full hover:bg-white/10 ${
                (highlighted || isFocused) ? "bg-white/10" : "bg-transparent"
            } ${isFocused ? "outline outline-[1px] outline-white/[0.18]" : "outline-none"}`}
        >
            <div className="flex items-center gap-2">
                {icon}
                <Label>{name}</Label>
            </div>
            <Label className="ml-auto opacity-70 text-[12px] cursor-default">
                {labelText}
            </Label>
        </button>
    );

    return (
        <>
            <ContextMenu onOpenChange={onContextMenuOpenChange}>
                <ContextMenuTrigger ref={triggerRef}>
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
                            {type === "app" && <ContextMenuSeparator />}
                            <ContextMenuItem onClick={handleOpenInExplorer}>
                                Open file location
                            </ContextMenuItem>
                            <ContextMenuItem onClick={handleCopyPath}>
                                Copy path
                            </ContextMenuItem>
                            {type === "file" && (
                                <ContextMenuItem onClick={handleCopyFile}>
                                    Copy file
                                </ContextMenuItem>
                            )}
                            {type !== "app" && (
                                <ContextMenuItem onClick={handleOpenWith}>
                                    Open file with
                                </ContextMenuItem>
                            )}
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>

            {(type === "commandConfirm" || type === "commandConfirmOpen") && (
                <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
                    <DialogContent className="sm:max-w-106.25 bg-[rgba(20,20,22,1)]">
                        <DialogHeader>
                            <DialogTitle>Confirm Command</DialogTitle>
                            <DialogDescription className="text-white/40">
                                Are you sure you want to run this command?
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-2">
                            <code className="block w-full p-3 rounded-lg text-sm font-mono break-all bg-white/[0.04] border border-white/[0.07] text-white/70">
                                {name}
                            </code>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={handleCancel}
                                className="border-white/10 text-white/45 hover:text-white/65"
                            >
                                Cancel (Esc)
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                variant="destructive"
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
        prevProps.logo === nextProps.logo &&
        prevProps.triggerAction === nextProps.triggerAction &&
        prevProps.triggerContextMenu === nextProps.triggerContextMenu
    );
});

export default function QuerySuggestions({ query, searchFilters, clearQuery, logoMap }: IQuerySuggestions) {
    const [pinnedApps, setPinnedApps] = useState<SearchQueryT[]>([])
    const [isCmdCommand, setIsCmdCommand] = useState<boolean>(false)
    const [cmdCommand, setCmdCommand] = useState<string>("")
    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const [triggeredIndex, setTriggeredIndex] = useState<number>(-1);
    const [triggeredContextMenuIndex, setTriggeredContextMenuIndex] = useState<number>(-1);
    const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);
    const blockNextEnterRef = useRef(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLElement | null)[]>([]);
    const [bestMatch, setBestMatch] = useState<SearchQueryT | null>(null);
    const [apps, setApps] = useState<SearchQueryT[]>([]);
    const [folders, setFolders] = useState<SearchQueryT[]>([]);
    const [files, setFiles] = useState<SearchQueryT[]>([]);
    const [settings, setSettings] = useState<SearchQueryT[]>([]);
    const [commands, setCommands] = useState<SearchQueryT[]>([]);
    const { enterArgMode } = useOutletContext<MainLayoutContext>();

    useEffect(() => {
        const reloadPinnedApps = async () => {
            const pApps = await window.electronStore.get("pinnedApps")
            setPinnedApps(pApps ? JSON.parse(pApps) : []);
        }
        reloadPinnedApps();
        window.addEventListener("pinnedAppsChanged", reloadPinnedApps);
        return () => window.removeEventListener("pinnedAppsChanged", reloadPinnedApps);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const words = query.trim().split(" ");
        const lastWord = words[words.length - 1];
        const hasBang = lastWord.startsWith("!cmd");
        const searchTerm = hasBang ? words.slice(0, -1).join(" ") : query;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsCmdCommand(hasBang);

        if (hasBang) {
            setCmdCommand(searchTerm);
            return;
        }

        const getData = async () => {
            const result: ProcessedQueryResult | null = await getQueryData(query.trim(), searchFilters);
            if (cancelled || !result) return;

            setBestMatch(result.bestMatch);
            setApps(result.apps);
            setFolders(result.folders);
            setFiles(result.files);
            setSettings(result.settings);
            setCommands(result.commands);
            const extra = result.bestMatch===null?0:1
            const items = result.apps.length + result.folders.length + result.settings.length +
                result.settings.length + result.commands.length + extra;
            if (items < focusedIndex + 1){
                setFocusedIndex(0);
            }
        };

        const timer = setTimeout(getData, 80);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, searchFilters]);

    const googleEntry = useMemo<SearchQueryT | null>(() => {
        const trimmed = query.trim();
        if (!trimmed || isCmdCommand) return null;
        return {
            name: trimmed,
            type: "googleSearch",
            path: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
            source: "web",
        };
    }, [query, isCmdCommand]);

    const allResults = useMemo<SearchQueryT[]>(() => [
        ...(bestMatch ? [bestMatch] : []),
        ...apps,
        ...commands,
        ...settings,
        ...files,
        ...folders,
        ...(googleEntry ? [googleEntry] : []),
    ], [bestMatch, apps, settings, files, folders, commands, googleEntry]);

    const handleContextMenuOpenChange = useCallback((open: boolean) => {
        setIsContextMenuOpen(open);
        if (!open) {
            blockNextEnterRef.current = true;
        }
    }, []);

    // Esc on an open context menu should close it (Radix self-handles), not
    // also navigate the page back.
    useEscapeBarrier(isContextMenuOpen);

    // Hybrid arg flow: parse positional values from `query` tokens (everything
    // after the first whitespace-separated token, with quote support). If all
    // required args are covered, run directly; otherwise transition into the
    // inline arg-entry bar pre-filled with whatever was parsed.
    const runCommandRequest = useCallback((item: SearchQueryT) => {
        if (!item.args || item.args.length === 0) {
            window.apps.executeCommand(item);
            return;
        }
        const tokens = tokenize(query).slice(1);
        const initial: Record<string, string> = {};
        item.args.forEach((a, i) => {
            const fromQuery = tokens[i];
            if (fromQuery !== undefined) initial[a.name] = fromQuery;
        });
        const missingRequired = item.args.some(a => {
            const v = initial[a.name];
            const has = (v ?? a.defaultValue ?? "").trim().length > 0;
            return a.required && !has;
        });
        if (!missingRequired && tokens.length >= item.args.length) {
            window.apps.executeCommand(item, initial);
            return;
        }
        enterArgMode(item, initial);
    }, [query, enterArgMode]);

    const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
        if (isContextMenuOpen) return;
        if (e.key === "Enter" && blockNextEnterRef.current) {
            blockNextEnterRef.current = false;
            return;
        }

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
            const hasArgs = !!item.args && item.args.length > 0;
            if (hasArgs && (item.type === "command" || item.type === "commandOpen" || item.type === "commandConfirm" || item.type === "commandConfirmOpen")) {
                e.preventDefault();
                runCommandRequest(item);
            } else if (item.type === "command" || item.type === "commandOpen") {
                await window.apps.executeCommand(item);
            } else if (item.type === "commandConfirm" || item.type === "commandConfirmOpen") {
                e.preventDefault();
                setTriggeredIndex(focusedIndex);
                setTimeout(() => setTriggeredIndex(-1), 100);
            } else if (item.type === "googleSearch" && item.path) {
                window.electron.openExternal(item.path);
            } else if (item.type === "app") {
                await window.apps.openApp(item);
            } else if (item.path) {
                window.file.openPath(item.path);
            }
        }
    }, [isContextMenuOpen, focusedIndex, allResults, isCmdCommand, cmdCommand, runCommandRequest]);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handleKeyDown]);

    const pinApp = useCallback(async (app: SearchQueryT) => {
        if (pinnedApps.length === 21) {
            window.electron.notify("Maximum Pins Reached", "You can pin up to 21 apps only.");
            return;
        }
        if (!pinnedApps.find((a) => isSameApp(a, app))) {
            const updated = [...pinnedApps, app];
            window.electronStore.set("pinnedApps", JSON.stringify(updated));
            setPinnedApps(updated);
            window.dispatchEvent(new CustomEvent("pinnedAppsChanged"));
            clearQuery();
        }
    }, [pinnedApps, clearQuery]);

    const unPinApp = useCallback(async (app: SearchQueryT) => {
        const updated = pinnedApps.filter((a) => !isSameApp(a, app));
        window.electronStore.set("pinnedApps", JSON.stringify(updated));
        setPinnedApps(updated);
        window.dispatchEvent(new CustomEvent("pinnedAppsChanged"));
    }, [pinnedApps]);

    const pinnedAppKeys = useMemo(() => {
        const set = new Set<string>();
        for (const a of pinnedApps) {
            set.add(`${a.appId}|${a.path}|${a.name}|${a.type}|${a.source}`);
        }
        return set;
    }, [pinnedApps]);

    const isAppPinned = useCallback((app: SearchQueryT): boolean => {
        return pinnedAppKeys.has(`${app.appId}|${app.path}|${app.name}|${app.type}|${app.source}`);
    }, [pinnedAppKeys]);

    useEffect(() => {
        const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
        const item = itemRefs.current[focusedIndex];
        if (!viewport || !item) return;
        const viewportRect = viewport.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (itemRect.bottom > viewportRect.bottom) {
            viewport.scrollTop += itemRect.bottom - viewportRect.bottom;
        } else if (itemRect.top < viewportRect.top) {
            viewport.scrollTop -= viewportRect.top - itemRect.top;
        }
    }, [focusedIndex]);

    return (
        <TooltipProvider>
        <ScrollArea ref={scrollAreaRef} className="w-full h-[420px] px-4">
            {isCmdCommand ? (
                <div>
                    <div className="text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-white/25 mb-2">CMD Command</div>
                    <div className="p-2 rounded-lg bg-white/5">
                        {cmdCommand}
                    </div>
                </div>
            ) : (
                allResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[380px] select-none">
                        <div className="relative mb-4">
                            <div className="absolute inset-0 blur-xl bg-white/[0.03] rounded-full" />
                            <div className="relative w-16 h-16 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                                <SearchX className="w-7 h-7 text-white/30" strokeWidth={1.5} />
                            </div>
                        </div>
                        <div className="text-[13px] font-medium text-white/50">Nothing here</div>
                        <div className="text-[11px] text-white/20 mt-1">Try a different search</div>
                    </div>
                ) : (
                    <>
                        {bestMatch && (
                            <div ref={el => { itemRefs.current[0] = el; }}>
                                <QueryComponent
                                    item={bestMatch}
                                    highlighted={focusedIndex === 0}
                                    pinApp={pinApp}
                                    unPinApp={unPinApp}
                                    isAppPinned={bestMatch.type === "app" ? isAppPinned(bestMatch) : false}
                                    logo={bestMatch.type === "app" ? logoMap.get(getLogoKey(bestMatch)) : undefined}
                                    triggerAction={triggeredIndex === 0}
                                    triggerContextMenu={triggeredContextMenuIndex === 0}
                                    onContextMenuOpenChange={handleContextMenuOpenChange}
                                    onRequestRunCommand={runCommandRequest}
                                />
                            </div>
                        )}

                        {apps.length > 0 && searchFilters[0] && (
                            <>
                                {apps.map((app, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0);
                                    return (
                                        <div key={`${app.name}-${app.path}-${index}`} ref={el => { itemRefs.current[itemIndex] = el; }}>
                                            <QueryComponent
                                                item={app}
                                                highlighted={focusedIndex === itemIndex}
                                                isAppPinned={isAppPinned(app)}
                                                logo={logoMap.get(getLogoKey(app))}
                                                pinApp={pinApp}
                                                unPinApp={unPinApp}
                                                triggerAction={triggeredIndex === itemIndex}
                                                triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                                onContextMenuOpenChange={handleContextMenuOpenChange}
                                                onRequestRunCommand={runCommandRequest}
                                            />
                                        </div>
                                    );
                                })}
                            </>
                        )}
                        {commands.length > 0 && searchFilters[4] && (
                            <>
                                {commands.map((command, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + apps.length;
                                    return (
                                        <div key={`${command.name}-${index}`} ref={el => { itemRefs.current[itemIndex] = el; }}>
                                            <QueryComponent
                                                item={command}
                                                highlighted={focusedIndex === itemIndex}
                                                triggerAction={triggeredIndex === itemIndex}
                                                triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                                onContextMenuOpenChange={handleContextMenuOpenChange}
                                                onRequestRunCommand={runCommandRequest}
                                            />
                                        </div>
                                    );
                                })}
                            </>
                        )}
                        {settings.length > 0 && searchFilters[3] && (
                            <>
                                {settings.map((file, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + commands.length + apps.length;
                                    return (
                                        <div key={`${file.name}-${index}`} ref={el => { itemRefs.current[itemIndex] = el; }}>
                                            <QueryComponent
                                                item={file}
                                                highlighted={focusedIndex === itemIndex}
                                                triggerAction={triggeredIndex === itemIndex}
                                                triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                                onContextMenuOpenChange={handleContextMenuOpenChange}
                                                onRequestRunCommand={runCommandRequest}
                                            />
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {files.length > 0 && searchFilters[1] && (
                            <>
                                {files.map((file, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + commands.length + apps.length + settings.length;
                                    return (
                                        <div key={`${file.name}-${file.path}-${index}`} ref={el => { itemRefs.current[itemIndex] = el; }}>
                                            <QueryComponent
                                                item={file}
                                                highlighted={focusedIndex === itemIndex}
                                                triggerAction={triggeredIndex === itemIndex}
                                                triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                                onContextMenuOpenChange={handleContextMenuOpenChange}
                                                onRequestRunCommand={runCommandRequest}
                                            />
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {folders.length > 0 && searchFilters[2] && (
                            <>
                                {folders.map((folder, index) => {
                                    const itemIndex = index + (bestMatch ? 1 : 0) + apps.length + commands.length + files.length + settings.length;
                                    return (
                                        <div key={`${folder.name}-${folder.path}-${index}`} ref={el => { itemRefs.current[itemIndex] = el; }}>
                                            <QueryComponent
                                                item={folder}
                                                highlighted={focusedIndex === itemIndex}
                                                triggerAction={triggeredIndex === itemIndex}
                                                triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                                onContextMenuOpenChange={handleContextMenuOpenChange}
                                                onRequestRunCommand={runCommandRequest}
                                            />
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {googleEntry && (() => {
                            const itemIndex = allResults.length - 1;
                            const focused = focusedIndex === itemIndex;
                            return (
                                <div ref={el => { itemRefs.current[itemIndex] = el; }} className={apps.length + commands.length + settings.length + files.length + folders.length + (bestMatch ? 1 : 0) > 0 ? "mt-2 pt-2 border-t border-white/[0.05]" : ""}>
                                    <button
                                        onClick={() => window.electron.openExternal(googleEntry.path!)}
                                        tabIndex={0}
                                        className={`cursor-pointer flex items-center justify-between py-2 px-3 rounded-lg select-none transition-colors duration-150 gap-3 w-full hover:bg-white/10 ${focused ? "bg-white/10 outline outline-[1px] outline-white/[0.18]" : "bg-transparent"}`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Google className="w-6 h-6 shrink-0" />
                                            <span className="text-[13px] text-white/80 truncate">
                                                Search Google for{" "}
                                                <span className="text-white font-medium">"{googleEntry.name}"</span>
                                            </span>
                                        </div>
                                        <span className="ml-auto opacity-70 text-[12px] cursor-default text-white/50 shrink-0">Web</span>
                                    </button>
                                </div>
                            );
                        })()}
                    </>
                )
            )}
        </ScrollArea>
        </TooltipProvider>
    );
}