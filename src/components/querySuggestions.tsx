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
    Globe,
    Search,
    SearchX,
    Sparkles
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
import { resolveBang, toHistoryEntry, openSearch, searchWith, ResolvedSearch } from "@/scripts/bangs.ts";

/** The web fallback row: the display entry plus the bang it resolved from. */
type WebEntry = { entry: SearchQueryT; resolved: ResolvedSearch };

/**
 * Favicon with a real fallback. Remounted per `src` (via a key at the call
 * site) so the failure flag resets when the row changes.
 */
const FaviconOrIcon = ({ src, children }: { src: string | null; children: React.ReactNode }) => {
    const [failed, setFailed] = useState(false);
    if (!src || failed) return <>{children}</>;
    return (
        <img
            src={src}
            alt=""
            className="w-6 h-6 shrink-0 rounded"
            onError={() => setFailed(true)}
        />
    );
};
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
import { useOutletContext, useNavigate } from "react-router";
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
    onExecuteCommand?: (item: SearchQueryT) => Promise<void>;
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
                                 onExecuteCommand,
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
            await onExecuteCommand?.(item);
        } else if (type === "commandConfirm" || type === "commandConfirmOpen") {
            setShowConfirmation(true);
        } else if (type === "app") {
            await window.apps.openApp(item);
        } else if (path) {
            window.file.openPath(path);
        }
    }, [type, item, path, isCommandType, hasArgs, onRequestRunCommand, onExecuteCommand]);

    const handleConfirm = useCallback(async () => {
        await onExecuteCommand?.(item);
        setShowConfirmation(false);
    }, [item, onExecuteCommand]);

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
            className={`cursor-pointer flex items-center justify-between py-2 px-3 rounded-lg select-none transition-colors duration-150 gap-3 w-full hover:bg-fill-100 ${
                (highlighted || isFocused) ? "bg-fill-100" : "bg-transparent"
            } ${isFocused ? "outline outline-[1px] outline-offset-[-1px] outline-ink/[0.18]" : "outline-none"}`}
        >
            {/* min-w-0 lets the name shrink; without it the flex item keeps its
                content width and a long file name wraps to a second line,
                which left rows at uneven heights and centred the text. */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="shrink-0 flex items-center">{icon}</span>
                {/* leading-normal overrides Label's leading-none: a line box the
                    exact height of the font, plus truncate's overflow-hidden,
                    clipped every descender — the y in "PyCharm" lost its tail.
                    The 24px icon still sets the row height, so this costs
                    nothing in layout. */}
                <Label className="block truncate min-w-0 leading-normal">{name}</Label>
            </div>
            <Label className="shrink-0 ml-auto max-w-[38%] block truncate opacity-70 text-[12px] leading-normal cursor-default">
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
                        {/* Now that names are cut off, the tooltip carries the
                            whole one — it used to show the path for files only,
                            which left a long app name unreadable anywhere. */}
                        <TooltipContent side="top" className="max-w-[540px]">
                            <span className="block break-all">{name}</span>
                            {path && type !== "setting" && path !== name && (
                                <span className="block break-all opacity-60 text-[11px] mt-0.5">{path}</span>
                            )}
                        </TooltipContent>
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
                    <DialogContent className="sm:max-w-106.25 bg-surface">
                        <DialogHeader>
                            <DialogTitle>Confirm Command</DialogTitle>
                            <DialogDescription className="text-ink/40">
                                Are you sure you want to run this command?
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-2">
                            <code className="block w-full p-3 rounded-lg text-sm font-mono break-all bg-fill-040 border border-line-070 text-ink/70">
                                {name}
                            </code>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={handleCancel}
                                className="border-line-100 text-ink/45 hover:text-ink/65"
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
    const [results, setResults] = useState<SearchQueryT[]>([]);
    // The query the current `results` actually belong to, so a pending search
    // is distinguishable from a search that genuinely found nothing.
    const [resolvedFor, setResolvedFor] = useState<string | null>(null);
    const [webSuggestions, setWebSuggestions] = useState<string[]>([]);
    const suggestionCountRef = useRef(0);
    const { enterArgMode } = useOutletContext<MainLayoutContext>();
    const navigate = useNavigate();
    const openAi = useCallback((q: string) => {
        navigate(`/ai?prompt=${encodeURIComponent(q)}`);
        clearQuery();
    }, [navigate, clearQuery]);

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
            if (cancelled) return;

            // Marked resolved even on failure, or a search that errored would
            // leave the list blank forever instead of falling back to the web
            // and AI rows.
            setResolvedFor(query.trim());
            if (!result) return;

            setResults(result.results);

            // Keep the highlight in range as results shrink.
            const localCount = result.results.length;
            // Read the live suggestion count from a ref rather than a dep, so
            // suggestions arriving don't re-trigger the search IPC.
            const webCount = query.trim() ? 1 + suggestionCountRef.current : 0;
            if (focusedIndex >= localCount + webCount) setFocusedIndex(0);
        };

        const timer = setTimeout(getData, 80);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, searchFilters]);

    // The web fallback. Always present so the web is one Enter away, but it
    // only outranks local results when the user typed an explicit bang.
    const webEntry = useMemo<WebEntry | null>(() => {
        if (isCmdCommand) return null;
        const resolved = resolveBang(query);
        if (!resolved) return null;
        return {
            entry: {
                name: resolved.isDirectUrl
                    ? resolved.searchTerm
                    : resolved.hasExplicitBang && resolved.searchTerm
                        ? `${resolved.bang.s}: ${resolved.searchTerm}`
                        : resolved.searchTerm,
                type: "webSearch",
                path: resolved.url,
                source: resolved.isDirectUrl ? (resolved.host ?? "web") : resolved.bang.s,
            },
            resolved,
        };
    }, [query, isCmdCommand]);

    // Sits beside the web row: the same "always one Enter away" idea, for the
    // AI window rather than the browser. Skipped for typed addresses, where the
    // destination is already known.
    const aiEntry = useMemo<SearchQueryT | null>(() => {
        const trimmed = query.trim();
        if (!trimmed || isCmdCommand) return null;
        if (webEntry?.resolved.isDirectUrl) return null;
        return { name: trimmed, type: "askAi", path: "", source: "AI" };
    }, [query, isCmdCommand, webEntry]);

    // An explicit bang or a typed-out address means the user has already told
    // us where they're going, so it takes the top slot ahead of any local guess.
    const promoteWeb = Boolean(webEntry && (webEntry.resolved.hasExplicitBang || webEntry.resolved.isDirectUrl));

    // Autocomplete only when the user has signalled web intent with a bang —
    // otherwise every app search would pull in remote suggestions.
    useEffect(() => {
        let cancelled = false;
        const resolved = webEntry?.resolved ?? null;
        // Always offered, so the list is never one row above a screen of empty
        // space. Skipped only for typed addresses, where the destination is
        // already known and suggestions would be noise.
        const term = resolved?.searchTerm?.trim() ?? "";
        const wanted = Boolean(term) && !resolved?.isDirectUrl;

        const timer = setTimeout(async () => {
            if (!wanted) {
                if (!cancelled) setWebSuggestions([]);
                return;
            }
            const raw = await window.electron.getGoogleSuggestions(term);
            if (cancelled) return;
            const cleaned = raw
                .map(s => s.replace(/<\/?b>/g, "").trim())
                .filter(s => s && s.toLowerCase() !== term.toLowerCase());
            setWebSuggestions([...new Set(cleaned)].slice(0, 8));
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [webEntry]);

    // Past searches are surfaced as inline completion in the input, so these
    // rows are remote suggestions only.
    const webBlockEntries = useMemo<SearchQueryT[]>(() => {
        if (!webEntry || !webSuggestions.length) return [];
        return webSuggestions.map(s => ({
            name: s,
            type: "webSuggestion",
            path: searchWith(webEntry.resolved.bang, s).searchUrl,
            source: webEntry.resolved.bang.s,
        }));
    }, [webSuggestions, webEntry]);

    // A promoted web block sits above the local results, so every local index
    // shifts by the whole block's size.
    const localOffset = promoteWeb ? 1 + webBlockEntries.length : 0;

    useEffect(() => {
        suggestionCountRef.current = webBlockEntries.length;
    }, [webBlockEntries.length]);

    const allResults = useMemo<SearchQueryT[]>(() => {
        const web = webEntry ? [webEntry.entry] : [];
        const ai = aiEntry ? [aiEntry] : [];
        return promoteWeb
            ? [...web, ...webBlockEntries, ...results, ...ai]
            : [...results, ...web, ...webBlockEntries, ...ai];
    }, [results, webEntry, promoteWeb, webBlockEntries, aiEntry]);

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
    // A history row reopens its own recorded URL; a suggestion row runs against
    // whichever bang is currently active.
    const openBlockEntry = useCallback((item: SearchQueryT) => {
        if (webEntry) openSearch(searchWith(webEntry.resolved.bang, item.name));
    }, [webEntry]);

    // Single entry point for running a command. Guards against a second Enter
    // landing while the first is still in flight, and clears the query on
    // success so the same command can't be fired again from a stale list.
    const runningRef = useRef(false);
    const runCommand = useCallback((item: SearchQueryT, argValues?: Record<string, string>) => {
        if (runningRef.current) return;
        runningRef.current = true;

        // Dismiss first. Waiting for the command to finish held the launcher
        // open for as long as the work took, which for anything slow read as a
        // hang. Any confirmation dialog has already been answered by here.
        clearQuery();
        window.electron.hideWindow();

        // The window is hidden, not destroyed, so this still resolves and can
        // report a failure that would otherwise vanish with the dismissal.
        window.apps.executeCommand(item, argValues)
            .then(result => {
                if (!result?.ok) {
                    window.electron.notify(`${item.name} failed`, result?.detail ?? "The command did not run.");
                }
            })
            .catch(err => {
                window.electron.notify(`${item.name} failed`, err?.message ?? "The command did not run.");
            })
            .finally(() => { runningRef.current = false; });
    }, [clearQuery]);

    const runCommandRequest = useCallback((item: SearchQueryT) => {
        if (!item.args || item.args.length === 0) {
            runCommand(item);
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
            runCommand(item, initial);
            return;
        }
        enterArgMode(item, initial);
    }, [query, enterArgMode, runCommand]);

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
            clearQuery();
        } else if (e.key === "Enter" && allResults[focusedIndex]) {
            const item = allResults[focusedIndex];
            const hasArgs = !!item.args && item.args.length > 0;
            if (hasArgs && (item.type === "command" || item.type === "commandOpen" || item.type === "commandConfirm" || item.type === "commandConfirmOpen")) {
                e.preventDefault();
                runCommandRequest(item);
            } else if (item.type === "command" || item.type === "commandOpen") {
                await runCommand(item);
            } else if (item.type === "commandConfirm" || item.type === "commandConfirmOpen") {
                e.preventDefault();
                setTriggeredIndex(focusedIndex);
                setTimeout(() => setTriggeredIndex(-1), 100);
            } else if (item.type === "webSearch" && webEntry) {
                await openSearch(toHistoryEntry(webEntry.resolved));
            } else if (item.type === "askAi") {
                openAi(item.name);
            } else if (item.type === "webSuggestion") {
                openBlockEntry(item);
            } else if (item.type === "app") {
                await window.apps.openApp(item);
            } else if (item.path) {
                window.file.openPath(item.path);
            }
        }
    }, [isContextMenuOpen, focusedIndex, allResults, isCmdCommand, cmdCommand, runCommandRequest, webEntry, openBlockEntry, runCommand, clearQuery]);

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

    /** The web row plus its autocomplete rows, rendered as one unit. */
    const renderWebBlock = (startIndex: number) => {
        if (!webEntry) return null;
        return (
            <>
                {renderWebRow(startIndex)}
                {webBlockEntries.map((item, index) => {
                    const itemIndex = startIndex + 1 + index;
                    const focused = focusedIndex === itemIndex;
                    return (
                        <div key={`${item.type}-${item.name}`} ref={el => { itemRefs.current[itemIndex] = el; }}>
                            <button
                                onClick={() => openBlockEntry(item)}
                                tabIndex={0}
                                className={`cursor-pointer flex items-center py-1.5 pl-11 pr-3 rounded-lg select-none transition-colors duration-150 gap-2 w-full hover:bg-fill-100 ${focused ? "bg-fill-100 outline outline-[1px] outline-offset-[-1px] outline-ink/[0.18]" : "bg-transparent"}`}
                            >
                                <Search className="w-3.5 h-3.5 shrink-0 text-ink/30" />
                                <span className="text-[12px] text-ink/60 truncate">{item.name}</span>
                            </button>
                        </div>
                    );
                })}
            </>
        );
    };

    /**
     * True between typing and the first results landing for that query, and only
     * when there is nothing to show meanwhile. Navigating home → search mounts
     * this component with an empty list, so without the guard the debounce plus
     * the IPC round-trip left the web and AI fallbacks sitting alone.
     *
     * Refining an existing search keeps the previous results on screen instead,
     * so this only ever applies to the first one.
     */
    const settling = resolvedFor !== query.trim() && results.length === 0;

    const renderWebRow = (itemIndex: number) => {
        if (!webEntry) return null;
        const { resolved } = webEntry;
        const focused = focusedIndex === itemIndex;
        const localCount = results.length;
        // Only bangs get a favicon: their domain comes from the bang list and is
        // stable. A typed address is still half-written on most keystrokes, and
        // the favicon service answers those with a generic globe of its own.
        const faviconUrl = resolved.hasExplicitBang && resolved.bang.d
            ? `https://www.google.com/s2/favicons?sz=24&domain_url=${encodeURIComponent(resolved.bang.d)}`
            : null;
        const fallbackIcon = resolved.isDirectUrl
            ? <Globe className="w-5 h-5 shrink-0 text-ink/40" />
            : <Google className="w-6 h-6 shrink-0" />;

        return (
            <div
                key="web-row"
                ref={el => { itemRefs.current[itemIndex] = el; }}
                className={!promoteWeb && localCount > 0 ? "mt-2 pt-2 border-t border-line-050" : ""}
            >
                <button
                    onClick={() => openSearch(toHistoryEntry(resolved))}
                    tabIndex={0}
                    className={`cursor-pointer flex items-center justify-between py-2 px-3 rounded-lg select-none transition-colors duration-150 gap-3 w-full hover:bg-fill-100 ${focused ? "bg-fill-100 outline outline-[1px] outline-offset-[-1px] outline-ink/[0.18]" : "bg-transparent"}`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <FaviconOrIcon key={faviconUrl ?? "none"} src={faviconUrl}>
                            {fallbackIcon}
                        </FaviconOrIcon>
                        <span className="text-[13px] text-ink/80 truncate">
                            {resolved.isDirectUrl ? (
                                <>Go to <span className="text-ink font-medium">{resolved.searchTerm}</span></>
                            ) : resolved.searchTerm ? (
                                <>
                                    Search {resolved.bang.s} for{" "}
                                    <span className="text-ink font-medium">"{resolved.searchTerm}"</span>
                                </>
                            ) : (
                                <>Open <span className="text-ink font-medium">{resolved.bang.s}</span></>
                            )}
                        </span>
                    </div>
                    <span className="ml-auto opacity-70 text-[12px] cursor-default text-ink/50 shrink-0">
                        {resolved.isDirectUrl ? "Link" : "Web"}
                    </span>
                </button>
            </div>
        );
    };

    return (
        <TooltipProvider>
        <ScrollArea ref={scrollAreaRef} className="w-full h-[420px] px-5">
            {isCmdCommand ? (
                <div>
                    <div className="text-center text-[11px] font-semibold tracking-[0.1em] uppercase text-ink/25 mb-2">CMD Command</div>
                    <div className="p-2 rounded-lg bg-fill-050">
                        {cmdCommand}
                    </div>
                </div>
            ) : settling ? (
                // Nothing has come back for this query yet. Rendering now would
                // show the web and AI fallbacks on their own for a frame, which
                // reads as "no results" right before the real list lands.
                <div className="h-[380px]" aria-hidden />
            ) : (
                allResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[380px] select-none">
                        <div className="relative mb-4">
                            <div className="absolute inset-0 blur-xl bg-fill-030 rounded-full" />
                            <div className="relative w-16 h-16 rounded-xl bg-fill-030 border border-line-060 flex items-center justify-center">
                                <SearchX className="w-7 h-7 text-ink/30" strokeWidth={1.5} />
                            </div>
                        </div>
                        <div className="text-[13px] font-medium text-ink/50">Nothing here</div>
                        <div className="text-[11px] text-ink/20 mt-1">Try a different search</div>
                    </div>
                ) : (
                    <>
                        {promoteWeb && renderWebBlock(0)}

                        {results.map((item, index) => {
                            const itemIndex = index + localOffset;
                            const isApp = item.type === "app";
                            return (
                                <div
                                    key={`${item.type}-${item.name}-${item.path ?? ""}-${index}`}
                                    ref={el => { itemRefs.current[itemIndex] = el; }}
                                >
                                    <QueryComponent
                                        item={item}
                                        highlighted={focusedIndex === itemIndex}
                                        pinApp={pinApp}
                                        unPinApp={unPinApp}
                                        isAppPinned={isApp ? isAppPinned(item) : false}
                                        logo={isApp ? logoMap.get(getLogoKey(item)) : undefined}
                                        triggerAction={triggeredIndex === itemIndex}
                                        triggerContextMenu={triggeredContextMenuIndex === itemIndex}
                                        onContextMenuOpenChange={handleContextMenuOpenChange}
                                        onRequestRunCommand={runCommandRequest}
                                        onExecuteCommand={runCommand}
                                    />
                                </div>
                            );
                        })}

                        {!promoteWeb && renderWebBlock(
                            allResults.length - webBlockEntries.length - 1 - (aiEntry ? 1 : 0),
                        )}

                        {aiEntry && (() => {
                            const itemIndex = allResults.length - 1;
                            const focused = focusedIndex === itemIndex;
                            return (
                                <div ref={el => { itemRefs.current[itemIndex] = el; }}>
                                    <button
                                        onClick={() => openAi(aiEntry.name)}
                                        tabIndex={0}
                                        className={`cursor-pointer flex items-center justify-between py-2 px-3 rounded-lg select-none transition-colors duration-150 gap-3 w-full hover:bg-fill-100 ${focused ? "bg-fill-100 outline outline-[1px] outline-offset-[-1px] outline-ink/[0.18]" : "bg-transparent"}`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Sparkles className="w-5 h-5 shrink-0 text-amber-300/70" />
                                            <span className="text-[13px] text-ink/80 truncate">
                                                Ask AI about{" "}
                                                <span className="text-ink font-medium">"{aiEntry.name}"</span>
                                            </span>
                                        </div>
                                        <span className="ml-auto opacity-70 text-[12px] cursor-default text-ink/50 shrink-0">AI</span>
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