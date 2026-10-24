/// <reference types="vite/client" />
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import type {ItemPreview} from "@/interfaces/preview.ts";
import type {LaunchHotkey, LaunchTarget} from "@/interfaces/launchHotkeys.ts";

export {};

type ProcessedSearchResult = {
    /** Score-ordered, strongest match first, regardless of type. */
    results: SearchQueryT[];
}

declare global {
    interface File {
        path: string;
    }

    /**
     * One step a provider reported on its way to an answer, a file it read, a
     * command it ran, a search it made. Kept separate from `reasoning` because
     * these are discrete events rather than a stream of tokens.
     */
    type AiActivity = {
        /** Verb, already in the present tense: "Reading", "Running". */
        label: string;
        /** What it acted on, a path, a command, a query. May be long. */
        detail?: string;
    };

    /** Picks the icon a step is drawn with. */
    type AiStepKind = "command" | "read" | "write" | "search" | "web" | "agent" | "tool";

    /**
     * One piece of work a CLI did, a command, a file read, a search. Sent as
     * it starts and again as it ends; the main process merges the two by id
     * and times them.
     */
    type AiStep = {
        id: string;
        /** The step that started this one, a subagent's own tool calls. */
        parentId?: string;
        kind?: AiStepKind;
        label: string;
        detail?: string;
        /** "stopped" means the turn ended before the step reported back. */
        status: "running" | "done" | "failed" | "stopped";
        /** The tail of what it printed or returned. */
        output?: string;
        exitCode?: number;
        startedAt?: number;
        endedAt?: number;
        /** How much of the answer had been written when it began, where it's drawn. */
        at?: number;
        /** Orders steps and thoughts that share an `at`. */
        seq?: number;
    };

    /** One stretch of thinking, placed in the answer like a step. */
    type AiThought = {
        id: string;
        text: string;
        at?: number;
        seq?: number;
        startedAt?: number;
        endedAt?: number;
    };

    /** An entry in the agent's own to-do list. */
    type AiPlanItem = {
        text: string;
        status: "pending" | "in_progress" | "completed";
        /** Present-tense form, shown while it is the one in progress. */
        active?: string;
    };

    type AiTurnStats = {
        model?: string;
        durationMs?: number;
        /** Model round trips within the turn. */
        turns?: number;
        inputTokens?: number;
        outputTokens?: number;
        /** What the turn would cost at API prices. Only meaningful on a key. */
        costUsd?: number;
        /** How much of a subscription's rolling window is spent, 0–1. */
        limit?: { window: string; utilization: number };
    };

    type AiChunk =
        | { requestId: string; type: "text"; text: string }
        /** Thinking tokens, added to the thought they belong to. */
        | { requestId: string; type: "reasoning"; thoughtId: string; text: string }
        /** A thought starting or ending; its text arrives as "reasoning". */
        | { requestId: string; type: "thought"; thought: Omit<AiThought, "text"> & { text?: string } }
        | { requestId: string; type: "step"; step: AiStep }
        | { requestId: string; type: "plan"; items: AiPlanItem[] | null }
        /** The turn's figures so far, merged, each one replaces the last. */
        | { requestId: string; type: "stats"; stats: AiTurnStats }
        | { requestId: string; type: "error"; message: string }
        /** A tool is waiting for the user's approval. */
        | ({ requestId: string; type: "permission" } & AiPermissionRequest)
        /** Answered, refused on a timeout, or dropped with its turn. */
        | { requestId: string; type: "permission-resolved"; permissionId: string; decision: AiPermissionDecision }
        | { requestId: string; type: "done"; sessionId?: string | null };

    type AiPermissionDecision = "allow" | "allow-chat" | "deny";

    /** A tool call the Claude CLI wants to make, held until the user decides. */
    type AiPermissionRequest = {
        permissionId: string;
        toolName: string;
        /** A full sentence: "Claude wants to run …". */
        title: string;
        /** The command, path or URL in full, what is actually being approved. */
        detail?: string;
    };

    type AiControl = {
        id: string;
        label: string;
        type: "select";
        /** `detail` explains the option in the menu; `danger` marks one that removes the safety net. */
        options: Array<{ id: string; label: string; detail?: string; danger?: boolean }>;
        default: string;
        /** Choosing a value also makes it the default for new conversations, the access mode. */
        sticky?: boolean;
    };

    /** A file sent with a prompt. Files on disk are referenced where they are. */
    type AiAttachment = {
        name: string;
        path: string;
        mimeType: string;
        size: number;
        /** Images go natively, text is inlined, the rest is given by path. */
        kind: "image" | "text" | "file";
    };

    /** What the composer hands over: a file on disk, or pasted data (base64). */
    type AiAttachmentInput =
        | { path: string; name?: string }
        | { name: string; mimeType: string; data: string };

    type AiMessage = {
        role: "user" | "assistant";
        content: string;
        /** Files sent with a user turn. */
        attachments?: AiAttachment[];
        /** How the answer was reached. Absent on user turns and older chats. */
        thoughts?: AiThought[];
        /** All of a turn's thinking in one piece, as older chats saved it. */
        reasoning?: string;
        /** The flat labels older chats saved, before steps had a status. */
        activities?: AiActivity[];
        steps?: AiStep[];
        /** Steps dropped from the front of a very long turn. */
        hiddenSteps?: number;
        plan?: AiPlanItem[];
        stats?: AiTurnStats;
        /** Names the raw log of the turn that produced this answer. */
        traceId?: string;
        /** Why the turn failed, when it did, kept so it reopens as a failure. */
        error?: string;
    };

    type AiChat = {
        id: string;
        title: string;
        providerId: string;
        model: string | null;
        sessionId: string | null;
        /** The provider's own controls as this conversation last used them. */
        settings: Record<string, string>;
        createdAt: number;
        updatedAt: number;
        messages: AiMessage[];
    };

    type AiChatSummary = {
        id: string;
        title: string;
        providerId: string;
        model: string | null;
        updatedAt: number;
        messageCount: number;
    };

    /** How a CLI provider pays for a turn, a plan you already have, or per token. */
    type AiBilling = {
        mode: "subscription" | "api-key" | "unknown";
        label: string;
    };

    type AiProviderInfo = {
        id: string;
        label: string;
        kind: "subscription-sdk" | "subscription-cli" | "api";
        needsKey: boolean;
        billing: AiBilling | null;
        available: boolean;
        detail: string | null;
        /**
         * `detail` is the wire id behind an alias, Claude's "Opus" says nothing
         * about which version it resolves to. A model may also narrow the
         * provider's controls, or drop them entirely.
         */
        models: Array<{ id: string; label: string; detail?: string; controls?: AiControl[] }>;
        controls: AiControl[];
    };

    type AiPrefs = {
        providerId: string | null;
        model: string | null;
        /** Per provider id → { controlId: value } */
        settings: Record<string, Record<string, string>>;
        /** Directory the CLI providers run in; null means the managed default. */
        workspace: string | null;
        /** Model ids typed by hand, per provider id, so they join the list. */
        customModels: Record<string, string[]>;
        /** Claude runs tools without asking. Off unless deliberately enabled. */
        claudeSkipPermissions: boolean;
        /** The AI view keeps the launcher open when you click away. */
        keepOpen: boolean;
    };

    interface Window {
        ai: {
            listProviders: () => Promise<AiProviderInfo[]>;
            /** Models arrive separately, reading a catalogue costs a CLI spawn. */
            providerModels: (id: string) => Promise<AiProviderInfo["models"]>;
            keyStatus: () => Promise<{ encryptionAvailable: boolean; keys: Record<string, boolean> }>;
            setKey: (providerId: string, key: string) => Promise<{ ok: boolean; detail?: string }>;
            clearKey: (providerId: string) => Promise<boolean>;
            getPrefs: () => Promise<AiPrefs>;
            setPrefs: (patch: Partial<AiPrefs>) => Promise<AiPrefs>;
            workspace: () => Promise<{ path: string; isDefault: boolean; defaultPath: string }>;
            runSetup: (stepId: "claude-install" | "claude-login" | "codex-install" | "codex-login") => Promise<boolean>;
            draftCommand: (request: {
                providerId: string;
                model?: string;
                settings?: Record<string, string>;
                description: string;
                existing?: SearchQueryT | null;
            }) => Promise<{ ok: boolean; command?: SearchQueryT; notes?: string[]; detail?: string }>;
            send: (request: {
                requestId: string;
                providerId: string;
                prompt: string;
                attachments?: AiAttachment[];
                sessionId?: string | null;
                chatId?: string;
                model?: string;
                settings?: Record<string, string>;
            }) => Promise<{ ok: boolean; detail?: string }>;
            cancel: (requestId: string) => Promise<boolean>;
            pathForFile: (file: File) => string;
            saveAttachments: (chatId: string, items: AiAttachmentInput[]) => Promise<AiAttachment[]>;
            openAttachment: (chatId: string, path: string) => Promise<boolean>;
            /** An attached image as a data URL, scaled to `maxSize` on its longest side. */
            attachmentImage: (chatId: string, path: string, maxSize: number) => Promise<{ url: string; width: number | null; height: number | null } | null>;
            onChunk: (cb: (chunk: AiChunk) => void) => () => void;
            setMode: (active: boolean) => void;
            /** Whether the open AI view holds the window up when you click away. */
            setKeepOpen: (keepOpen: boolean) => void;
            listChats: () => Promise<AiChatSummary[]>;
            getChat: (id: string) => Promise<AiChat | null>;
            createChat: (opts: { providerId: string; model?: string | null; settings?: Record<string, string> }) => Promise<AiChat>;
            deleteChat: (id: string) => Promise<boolean>;
            appendMessage: (id: string, message: AiMessage) => Promise<AiChat | null>;
            finishMessage: (id: string, payload: {
                content: string;
                sessionId?: string | null;
                providerId?: string;
                reasoning?: string;
                activities?: AiActivity[];
                error?: string;
            }) => Promise<AiChat | null>;
            updateChatConfig: (id: string, config: { providerId?: string; model?: string | null; settings?: Record<string, string> }) => Promise<AiChat | null>;
            trimForRerun: (id: string) => Promise<AiChat | null>;
            deleteAllChats: () => Promise<number>;
            renameChat: (id: string, title: string) => Promise<AiChat | null>;
            activeTurn: (chatId: string) => Promise<{
                requestId: string;
                text: string;
                thoughts: AiThought[];
                steps: AiStep[];
                hiddenSteps: number;
                plan: AiPlanItem[] | null;
                stats: AiTurnStats;
                /** Approvals still waiting on an answer. */
                permissions: AiPermissionRequest[];
            } | null>;
            /** Chat ids with a turn in flight, more than one can run at a time. */
            activeTurns: () => Promise<string[]>;
            respondPermission: (requestId: string, permissionId: string, decision: AiPermissionDecision) => Promise<boolean>;
            /** Opens a turn's raw event log. False once it has been pruned. */
            openTrace: (traceId: string) => Promise<boolean>;
        };
        electron: {
            log:(data:any) => void;
            notify:(title:string, message:string) => void;
            setOpenBind:(binding:string)=>Promise<boolean>;
            openExternal:(url: string) => void;
            onWindowBlurred: (callback: () => void) => () => void;
            onWindowLocked: (callback: () => void) => () => void;
            onWindowUnlocked: (callback: () => void) => () => void;
            getGoogleSuggestions: (query:string) => Promise<string[]>;
            openUninstall:()=>void;
            onCacheLoaded:(callback: () => void) => () => void;
            onCacheReload:(callback: () => void) => () => void;
            getCacheLoadingStatus:()=>Promise<{loading:boolean; current:number; total:number}>;
            setCacheLoadingBar: (callback: (currentCacheStep: number, totalCacheSteps: number) => void) => () => void;
            executeCmd: (command: string) => void;
            setFolderDialogOpen:(isOpen: boolean)=>Promise<void>;
            showFolderDialog:()=>Promise<string | null>;
            deleteFolder:(path:string)=>Promise<boolean>;

            searchQuery:(query:string, filters:boolean[]) => Promise<ProcessedSearchResult>;
            /** Tells ranking which result the user opened for this query. */
            recordChoice:(query:string, item:SearchQueryT) => void;
            /** Forgets what ranking learned from use (the usage stats behind Clear History). */
            clearUsage:() => Promise<boolean>;
            hideWindow:()=>void;
            getAppVersion:()=>Promise<string>;
            getOpenOnStartup:()=>Promise<boolean>;
            setOpenOnStartup:(enabled:boolean)=>Promise<boolean>;
            onUpdateProgress:(callback:(data:{percent:number})=>void)=>() => void;
            onUpdateDownloaded:(callback:()=>void)=>() => void;
            onUpdateNotAvailable:(callback:()=>void)=>() => void;
            onUpdateError:(callback:(data:{message:string})=>void)=>() => void;
            quitAndInstall:()=>void;
            /** ok false: no check started (unpackaged build, or it failed), no event will follow. */
            checkForUpdates:()=>Promise<{ok:boolean; message?:string}>;
            getFolderFileCounts:()=>Promise<Record<string, number>>;
            getUpdateModalInfo:()=>Promise<{show:boolean; previousVersion?:string; currentVersion?:string}>;
            /** The update notes were closed; they won't be offered again this run. */
            updateModalSeen: () => void;
        };
        electronStore: {
            set: (key: string, value: any) => void;
            get: (key: string) => Promise<string>;
            clear: () => void;
        };
        apps:{
            searchApps: (query: string) => Promise<SearchQueryT[]>;
            searchSettings: (query: string) => Promise<SearchQueryT[]>;
            searchCommands: (query: string) => Promise<SearchQueryT[]>;
            getCustomCommands: () => Promise<SearchQueryT[]>;
            getPresetCommands: () => Promise<SearchQueryT[]>;
            addCustomCommand: (command: SearchQueryT) => Promise<SearchQueryT[]>;
            removeCustomCommand: (name: string) => Promise<SearchQueryT[]>;
            importScriptFile: () => Promise<{content: string; fileName: string; filePath: string} | null>;
            importCommandsFile: () => Promise<SearchQueryT[] | null>;
            exportCommandsFile: () => Promise<boolean>;
            updateCustomCommand: (originalName: string, command: SearchQueryT) => Promise<SearchQueryT[] | null>;
            openApp: (app: SearchQueryT,admin?:boolean) => Promise<boolean>;
            openSettings: (settings: string) => Promise<boolean>;
            getAppLogo:(app: SearchQueryT) => Promise<string>;
            getUwpAppLogo:(app:SearchQueryT) => Promise<string>;
            getSteamGameLogo:(appId:string) => Promise<string | null>;
            getAppLogoUrls:(apps: SearchQueryT[]) => Promise<(string | null)[]>;
            getLinkFavicon:(link:string)=>Promise<string | null>
            getLaunchHotkeys:() => Promise<LaunchHotkey[]>;
            /** null when it took, otherwise why not. An empty combo clears it. */
            setLaunchHotkey:(target: LaunchTarget, combo: string) => Promise<string | null>;
            executeCommand:(command:SearchQueryT, argValues?:Record<string,string>) => Promise<{ ok: boolean; detail?: string }>;
        };
        file:{
            searchFilesAndFolders: (query: string) => Promise<SearchQueryT[]>;
            openPath: (path: string) => void;
            openInExplorer:(path: string) => void;
            openFileWith:(path: string) => void;
            copyFileToClipboard:(path: string) => void;
            cacheFolder:(path: string) => Promise<boolean>;
            getPreview:(item: SearchQueryT) => Promise<ItemPreview>;
            /** Windows file-type icons as data URLs, keyed by each item's path. */
            getFileIcons:(items: SearchQueryT[]) => Promise<Record<string, string | null>>;
            /** PDF bytes for rendering a preview; null for non-PDFs or files over 50 MB. */
            readPdf:(path: string) => Promise<Uint8Array | null>;
        }
    }
}
