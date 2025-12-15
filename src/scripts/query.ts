import {SearchQueryT} from "@/interfaces/searchQuery.ts";


interface QueryData {
    query: string;
    setBestMatch: React.Dispatch<React.SetStateAction<SearchQueryT | null>>;
    searchQueryFilters: boolean[]

}

async function getQueryData({ query, setBestMatch,searchQueryFilters }: QueryData) {
    let apps: SearchQueryT[] = await window.apps.searchApps(query);
    const start = performance.now();
    const downloadFileFolders = await window.file.searchFilesAndFolders("", query);
    window.electron.log("Search End: "+(performance.now()-start).toString()+"ms");
    const settings = await window.apps.searchSettings(query);
    let downloadFiles = downloadFileFolders.filter(item => item.type === "file");
    let downloadFolders = downloadFileFolders.filter(item => item.type === "folder");
    if (apps.length > 0) {
        const appLaunchStack:string[] = JSON.parse((await window.electronStore.get("appLaunchStack")) ?? "[]");
        const bestMatches:SearchQueryT[]  = apps.filter(item=>item.name.toLowerCase().startsWith(query.toLowerCase()));
        const filteredAppLaunchStack:string[] = appLaunchStack.filter(item=>item.toLowerCase().startsWith(query.toLowerCase()))

        let best:SearchQueryT | undefined = undefined;
        for (const match of bestMatches) {
            const index = filteredAppLaunchStack.lastIndexOf(match.name);
            if (index !== -1) {
                if (!best || appLaunchStack.lastIndexOf(match.name) < appLaunchStack.lastIndexOf(best.name)) {
                    best = match;
                }
            }
        }

        if (best && searchQueryFilters[0]) {
            setBestMatch(best);
            apps = apps.filter(app=>JSON.stringify(app) !== JSON.stringify(best));
        } else {
            setBestMatch(null);
        }
    }
    else if (settings.length > 0) {
        const best:SearchQueryT | undefined = settings.find(setting =>{
            return setting.name.toLowerCase().startsWith(query.toLowerCase())
        })
        if (best && searchQueryFilters[3]) {
            setBestMatch(best);
        }
        else {
            setBestMatch(null);
        }
    }
    else if (downloadFolders.length > 0) {
        const best = downloadFolders.find(folder => {
            return folder.name.toLowerCase().startsWith(query.toLowerCase());
        });
        if (best && searchQueryFilters[1]) {
            setBestMatch(best);
            downloadFolders = downloadFolders.filter(folder=>JSON.stringify(folder) !== JSON.stringify(best));
        } else {
            setBestMatch(null);
        }
    } else if (downloadFiles.length > 0) {
        const best = downloadFiles.find(file => {
            return file.name.toLowerCase().startsWith(query.toLowerCase());
        });
        if (best && searchQueryFilters[2]) {
            setBestMatch(best);
            downloadFiles = downloadFiles.filter(files => JSON.stringify(files) !== JSON.stringify(best));
        } else {
            setBestMatch(null);
        }
    } else {
        setBestMatch(null);
    }
    window.electron.log("Function End: "+(performance.now()-start).toString()+"ms");
    return {
        apps:apps,
        folders: downloadFolders,
        files: downloadFiles,
        settings: settings,
    };
}
function getNameFromPath(path: string): string {
    const segments = path.split(/[\\/]/);
    return segments[segments.length - 1];
}
export {getQueryData,getNameFromPath};
