import path from "path";
import os from "os";
import fg from "fast-glob";
import fs from "fs";

export async function searchApps(appCache,query) {
    if (!appCache || !Array.isArray(appCache)) return [];
    const lowerQuery = query.toLowerCase().trim();
    return appCache.filter(app => app.name.toLowerCase().includes(lowerQuery));
}

export async function searchFilesAndFolders(baseDir, query) {
    const lowerQuery = query.toLowerCase();
    const baseDirs = [path.join(os.homedir(), "Downloads")];
    if (baseDir!==""){
        baseDirs.push(baseDir);
    }
    const userHome = os.homedir();
    const folderMap = {
        Downloads: path.join(userHome, "Downloads"),
        Documents: path.join(userHome, "Documents"),
        Desktop: path.join(userHome, "Desktop")
    };
    const suggestedFolders = []
    for (const key in folderMap) {
        if (key.toLowerCase().startsWith(lowerQuery)) {
            suggestedFolders.push({
                name:key,
                type: "folder",
                path: folderMap[key],
                source: "PreDefined"
            })
        }
    }
    // const suggestedFolders = Object.entries(folderMap).flatMap(([key, folderPath]) => {
    //     if (lowerQuery.includes(key.toLowerCase())) {
    //         return [{
    //             name: key.charAt(0).toUpperCase() + key.slice(1),
    //             type: "folder",
    //             path: folderPath
    //         }];
    //     }
    //     return [];
    // });
    const dirSearchPromises = baseDirs.map(async (dir) => {
        const matches = await fg([`**/*`], {
            cwd: dir,
            absolute: true,
            onlyFiles: false,
            suppressErrors: true
        });

        return matches.flatMap(fullPath => {
            try {
                const stat = fs.statSync(fullPath);
                const name = path.basename(fullPath);
                if (name.toLowerCase().includes(lowerQuery)) {
                    return [{
                        name,
                        type: stat.isFile() ? 'file' : 'folder',
                        path: fullPath,
                    }];
                }
            } catch {
            }
            return [];
        });
    });

    const searchResults = (await Promise.all(dirSearchPromises)).flat();
    return [...suggestedFolders, ...searchResults];
}

