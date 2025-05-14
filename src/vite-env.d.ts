/// <reference types="vite/client" />
import {SearchQueryT} from "@/interfaces/searchQuery.ts";

export {};

declare global {
    interface Window {
        electron: {
            invoke: (channel: string, data?: any) => Promise<any>;
            openExternal:(url: string) => void;
            onWindowBlurred: (callback: () => void) => void;
            getGoogleSuggestions: (query:string) => Promise<string[]>;
            openUninstall:()=>void;
            onCacheLoaded:(callback: () => void) => void;
            getCacheLoadingStatus:()=>Promise<boolean>;
        };
        electronStore: {
            set: (key: string, value: any) => void;
            get: (key: string) => Promise<string>;
        };
        apps:{
            searchApps: (query: string) => Promise<SearchQueryT[]>;
            openApp: (app: SearchQueryT,admin=false) => Promise<boolean>;
            getAppLogo:(app: SearchQueryT) => Promise<string>;
            getUwpAppLogo:(appName:string) => Promise<string>;
        };
        file:{
            searchFilesAndFolders: (baseDir: string, query: string) => Promise<SearchQueryT[]>;
            openPath: (path: string) => void;
            openInExplorer:(path: string) => void;
            openFileWith:(path: string) => void;
        }
    }
}
