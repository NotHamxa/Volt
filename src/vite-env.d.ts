/// <reference types="vite/client" />
import {SearchQueryT} from "@/interfaces/searchQuery.ts";

export {};

declare global {
    interface Window {
        electron: {
            invoke: (channel: string, data?: any) => Promise<any>;
            setWindowHeight:(height: number) => void;
            openExternal:(url: string) => void;
            searchApps: (query: string) => Promise<SearchQueryT[]>;
            searchFilesAndFolders: (baseDir: string, query: string) => Promise<SearchQueryT[]>;
            onWindowBlurred: (callback: () => void) => void;
            openPath: (path: string) => void;
            openApp: (app: SearchQueryT,admin=false) => Promise<boolean>;
            openInExplorer:(path: string) => void;
            getGoogleSuggestions: (query:string) => Promise<string[]>;
            getAppLogo:(path: string) => Promise<string>;
        };
        electronStore: {
            set: (key: string, value: any) => void;
            get: (key: string) => Promise<string>;
        };
    }
}
