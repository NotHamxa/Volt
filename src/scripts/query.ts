import {SearchQueryT} from "@/interfaces/searchQuery.ts";


interface QueryData {
    query: string;
    setBestMatch: React.Dispatch<React.SetStateAction<SearchQueryT | null>>;

}

async function getQueryData({ query, setBestMatch }: QueryData) {
    const apps: SearchQueryT[] = await window.apps.searchApps(query);
    const downloadFileFolders = await window.file.searchFilesAndFolders("", query);
    const downloadFiles = downloadFileFolders.filter(item => item.type === "file");
    const downloadFolders = downloadFileFolders.filter(item => item.type === "folder");

    if (apps.length > 0) {
        const best = apps.find(app => {
            return app.name.toLowerCase().startsWith(query.toLowerCase());
        });
        if (best) {
            setBestMatch(best);
        } else {
            setBestMatch(null);
        }
    } else if (downloadFolders.length > 0) {
        const best = downloadFolders.find(folder => {
            return folder.name.toLowerCase().startsWith(query.toLowerCase());
        });
        if (best) {
            setBestMatch(best);
        } else {
            setBestMatch(null);
        }
    } else if (downloadFiles.length > 0) {
        const best = downloadFiles.find(file => {
            return file.name.toLowerCase().startsWith(query.toLowerCase());
        });
        if (best) {
            setBestMatch(best);
        } else {
            setBestMatch(null);
        }
    } else {
        setBestMatch(null);
    }

    return {
        apps:apps,
        folders: downloadFolders,
        files: downloadFiles,
    };
}
function getNameFromPath(path: string): string {
    const segments = path.split(/[\\/]/);
    return segments[segments.length - 1];
}
export {getQueryData,getNameFromPath};
