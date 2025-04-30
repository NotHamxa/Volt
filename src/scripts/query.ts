
interface QueryData {
    query: string;
    setBestMatch: React.Dispatch<React.SetStateAction<string>>;
}

async function getQueryData({query,setBestMatch}:QueryData){
    const apps: string[] = await window.electron.searchApps(query);
    const downloadFileFolders = await window.electron.searchFilesAndFolders("C:\\Users\\Hamxa\\Downloads",query);

    const downloadFiles: string[] = downloadFileFolders.files
    const downloadFolders: string[] = downloadFileFolders.folders
    if (apps.length > 0) {
        const best = apps.find(app => {
            const segments = app.split(/[\\/]/);
            const fileNameWithExt = segments[segments.length - 1];
            const fileName = fileNameWithExt.replace(/\.[^/.]+$/, "");
            return fileName.toLowerCase().startsWith(query.toLowerCase());
        });
        setBestMatch(best || "");
    }
    else if (downloadFolders.length > 0) {
        const best = downloadFolders.find(folder => {
            const segments = folder.split(/[\\/]/);
            const folderName = segments[segments.length - 1];
            return folderName.toLowerCase().startsWith(query.toLowerCase());
        });
        setBestMatch(best || "");
    } else if (downloadFiles.length > 0) {
        const best = downloadFiles.find(file => {
            const segments = file.split(/[\\/]/);
            const fileNameWithExt = segments[segments.length - 1];
            const fileName = fileNameWithExt.replace(/\.[^/.]+$/, "");
            return fileName.toLowerCase().startsWith(query.toLowerCase());
        });
        setBestMatch(best || "");
    }
    else {
        setBestMatch("")
    }
    return {"apps":apps,"folders":downloadFolders,"files":downloadFiles}
}
function getNameFromPath(path: string): string {
    const segments = path.split(/[\\/]/);
    return segments[segments.length - 1];
}
export {getQueryData,getNameFromPath};
