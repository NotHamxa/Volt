/// <reference types="vite/client" />
import {SearchQueryT} from "@/interfaces/searchQuery.ts";

export {};

type ProcessedSearchResult = {
    bestMatch: SearchQueryT | null;
    apps:      SearchQueryT[];
    files:     SearchQueryT[];
    folders:   SearchQueryT[];
    settings:  SearchQueryT[];
    commands:  SearchQueryT[];
}

declare global {
    interface Window {
        electron: {
            log:(data:any) => void;
            invoke: (channel: string, data?: any) => Promise<any>;
            setOpenBind:(binding:string)=>Promise<boolean>;
            openExternal:(url: string) => void;
            onWindowBlurred: (callback: () => void) => void;
            onWindowLocked: (callback: () => void) => void;
            onWindowUnlocked: (callback: () => void) => void;
            getGoogleSuggestions: (query:string) => Promise<string[]>;
            openUninstall:()=>void;
            onCacheLoaded:(callback: () => void) => void;
            onCacheReload:(callback: () => void) => void;
            getCacheLoadingStatus:()=>Promise<boolean>;
            setCacheLoadingBar: (callback: (currentCacheStep: number, totalCacheSteps: number) => void) => void;
            executeCmd: (command: string) => void;
            selectFolder:()=>Promise<string | null>;
            deleteFolder:(path:string)=>Promise<boolean>;

            searchQuery:(query:string, filters:boolean[]) => Promise<ProcessedSearchResult>;
            toggleEscape:(state:boolean)=>Promise<void>;
            getAppVersion:()=>Promise<string>;
            getOpenOnStartup:()=>Promise<boolean>;
            setOpenOnStartup:(enabled:boolean)=>Promise<boolean>;
            onUpdateProgress:(callback:(data:{percent:number})=>void)=>void;
            onUpdateDownloaded:(callback:()=>void)=>void;
            quitAndInstall:()=>void;
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
            openApp: (app: SearchQueryT,admin=false) => Promise<boolean>;
            openSettings: (settings: string) => Promise<boolean>;
            getAppLogo:(app: SearchQueryT) => Promise<string>;
            getUwpAppLogo:(app:SearchQueryT) => Promise<string>;
            getLinkFavicon:(link:string)=>Promise<string | null>
            executeCommand:(command:SearchQueryT) => void;
        };
        file:{
            searchFilesAndFolders: (query: string) => Promise<SearchQueryT[]>;
            openPath: (path: string) => void;
            openInExplorer:(path: string) => void;
            openFileWith:(path: string) => void;
            cacheFolder:(path: string) => Promise<boolean>;
            getImageB64:(path,width=50)=>Promise<string | null>;
        }
    }
}
