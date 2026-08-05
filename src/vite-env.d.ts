/// <reference types="vite/client" />
import {SearchQueryT} from "@/interfaces/searchQuery.ts";

export {};

type ProcessedSearchResult = {
    /** Score-ordered, strongest match first, regardless of type. */
    results: SearchQueryT[];
}

declare global {
    interface File {
        path: string;
    }

    type AiChunk =
        | { requestId: string; type: "text"; text: string }
        | { requestId: string; type: "error"; message: string }
        | { requestId: string; type: "done"; sessionId?: string };

    type AiControl = {
        id: string;
        label: string;
        type: "select";
        options: Array<{ id: string; label: string }>;
        default: string;
    };

    type AiMessage = { role: "user" | "assistant"; content: string };

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

    /** How a CLI provider pays for a turn — a plan you already have, or per token. */
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
         * `detail` is the wire id behind an alias — Claude's "Opus" says nothing
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
    };

    interface Window {
        ai: {
            listProviders: () => Promise<AiProviderInfo[]>;
            /** Models arrive separately — reading a catalogue costs a CLI spawn. */
            providerModels: (id: string) => Promise<AiProviderInfo["models"]>;
            keyStatus: () => Promise<{ encryptionAvailable: boolean; keys: Record<string, boolean> }>;
            setKey: (providerId: string, key: string) => Promise<{ ok: boolean; detail?: string }>;
            clearKey: (providerId: string) => Promise<boolean>;
            getPrefs: () => Promise<AiPrefs>;
            setPrefs: (patch: Partial<AiPrefs>) => Promise<AiPrefs>;
            workspace: () => Promise<{ path: string; isDefault: boolean; defaultPath: string }>;
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
                sessionId?: string | null;
                chatId?: string;
                model?: string;
                settings?: Record<string, string>;
            }) => Promise<{ ok: boolean; detail?: string }>;
            cancel: (requestId: string) => Promise<boolean>;
            onChunk: (cb: (chunk: AiChunk) => void) => () => void;
            setMode: (active: boolean) => void;
            listChats: () => Promise<AiChatSummary[]>;
            getChat: (id: string) => Promise<AiChat | null>;
            createChat: (opts: { providerId: string; model?: string | null; settings?: Record<string, string> }) => Promise<AiChat>;
            deleteChat: (id: string) => Promise<boolean>;
            appendMessage: (id: string, message: AiMessage) => Promise<AiChat | null>;
            finishMessage: (id: string, payload: { content: string; sessionId?: string }) => Promise<AiChat | null>;
            updateChatConfig: (id: string, config: { providerId?: string; model?: string | null; settings?: Record<string, string> }) => Promise<AiChat | null>;
            trimForRerun: (id: string) => Promise<AiChat | null>;
            deleteAllChats: () => Promise<number>;
            renameChat: (id: string, title: string) => Promise<AiChat | null>;
            activeTurn: (chatId: string) => Promise<{ requestId: string; text: string } | null>;
            /** Chat ids with a turn in flight — more than one can run at a time. */
            activeTurns: () => Promise<string[]>;
        };
        electron: {
            log:(data:any) => void;
            notify:(title:string, message:string) => void;
            setOpenBind:(binding:string)=>Promise<boolean>;
            openExternal:(url: string) => void;
            onWindowBlurred: (callback: () => void) => void;
            onWindowLocked: (callback: () => void) => void;
            onWindowUnlocked: (callback: () => void) => void;
            getGoogleSuggestions: (query:string) => Promise<string[]>;
            openUninstall:()=>void;
            onCacheLoaded:(callback: () => void) => void;
            onCacheReload:(callback: () => void) => void;
            getCacheLoadingStatus:()=>Promise<{loading:boolean; current:number; total:number}>;
            setCacheLoadingBar: (callback: (currentCacheStep: number, totalCacheSteps: number) => void) => void;
            executeCmd: (command: string) => void;
            setFolderDialogOpen:(isOpen: boolean)=>Promise<void>;
            showFolderDialog:()=>Promise<string | null>;
            deleteFolder:(path:string)=>Promise<boolean>;

            searchQuery:(query:string, filters:boolean[]) => Promise<ProcessedSearchResult>;
            hideWindow:()=>void;
            getAppVersion:()=>Promise<string>;
            getOpenOnStartup:()=>Promise<boolean>;
            setOpenOnStartup:(enabled:boolean)=>Promise<boolean>;
            onUpdateProgress:(callback:(data:{percent:number})=>void)=>void;
            onUpdateDownloaded:(callback:()=>void)=>void;
            onUpdateNotAvailable:(callback:()=>void)=>void;
            quitAndInstall:()=>void;
            checkForUpdates:()=>Promise<boolean>;
            getFolderFileCounts:()=>Promise<Record<string, number>>;
            getUpdateModalInfo:()=>Promise<{show:boolean; previousVersion?:string; currentVersion?:string}>;
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
            getLinkFavicon:(link:string)=>Promise<string | null>
            executeCommand:(command:SearchQueryT, argValues?:Record<string,string>) => Promise<{ ok: boolean; detail?: string }>;
        };
        file:{
            searchFilesAndFolders: (query: string) => Promise<SearchQueryT[]>;
            openPath: (path: string) => void;
            openInExplorer:(path: string) => void;
            openFileWith:(path: string) => void;
            copyFileToClipboard:(path: string) => void;
            cacheFolder:(path: string) => Promise<boolean>;
        }
    }
}
