/// <reference types="vite/client" />
export {};

declare global {
    interface Window {
        electron: {
            invoke: (channel: string, data?: any) => Promise<any>;
            setWindowHeight:(height: number) => void;
            openExternal:(url: string) => void;
        };
        electronStore: {
            set: (key: string, value: any) => void;
            get: (key: string) => Promise<string>;
        };
        fileSearch: {
            searchApps: (query: string) => Promise<string[]>;
            searchFilesAndFolders: (baseDir: string, query: string) => Promise<{ files: string[]; folders: string[] }>;
        };
    }
}
