/// <reference types="vite/client" />
import {SearchQueryT} from "@/interfaces/searchQuery.ts";

export {};

declare global {
    interface Window {
        electron: {
            invoke: (channel: string, data?: any) => Promise<any>;
            setOpenBind:(binding:string)=>Promise<boolean>;
            openExternal:(url: string) => void;
            onWindowBlurred: (callback: () => void) => void;
            getGoogleSuggestions: (query:string) => Promise<string[]>;
            openUninstall:()=>void;
            onCacheLoaded:(callback: () => void) => void;
            onCacheReload:(callback: () => void) => void;
            getCacheLoadingStatus:()=>Promise<boolean>;
            setCacheLoadingBar: (callback: (currentCacheStep: number, totalCacheSteps: number) => void) => void;
            executeCmd: (command: string) => void;
        };
        electronStore: {
            set: (key: string, value: any) => void;
            get: (key: string) => Promise<string>;
            clear: () => void;
        };
        apps:{
            searchApps: (query: string) => Promise<SearchQueryT[]>;
            searchSettings: (query: string) => Promise<SearchQueryT[]>;
            openApp: (app: SearchQueryT,admin=false) => Promise<boolean>;
            openSettings: (settings: string) => Promise<boolean>;
            getAppLogo:(app: SearchQueryT) => Promise<string>;
            getUwpAppLogo:(app:SearchQueryT) => Promise<string>;
        };
        file:{
            searchFilesAndFolders: (baseDir: string, query: string) => Promise<SearchQueryT[]>;
            openPath: (path: string) => void;
            openInExplorer:(path: string) => void;
            openFileWith:(path: string) => void;
        }
    }
}
