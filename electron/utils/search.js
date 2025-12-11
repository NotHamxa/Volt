import path from "path";
import os from "os";
import fg from "fast-glob";
import fs from "fs";
import settings from "./settings.json" with { type: 'json' };
import Store from "electron-store";
const store = new Store();
const normaliseString = (str) => {
    return str.toLowerCase().replace(/\s+/g, "");
}

export async function searchApps(appCache,query) {
    if (!appCache || !Array.isArray(appCache)) return [];
    const lowerQuery = normaliseString(query).trim();
    return appCache.filter(app => normaliseString(app.name).includes(lowerQuery));
}

export async function searchSettings(query) {
    if (!settings) return [];
    const lowerQuery = normaliseString(query).trim();
    return settings.filter(app => normaliseString(app.name).includes(lowerQuery));
}

export async function searchFilesAndFolders(baseDir, query) {
    const lowerQuery = normaliseString(query).trim();
    const baseDirs = [path.join(os.homedir(), "Downloads")];
    const cachedFolderData = await store.get("cachedFoldersData") ?? {}

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
        if (normaliseString(key).startsWith(lowerQuery)) {
            suggestedFolders.push({
                name:key,
                type: "folder",
                path: folderMap[key],
                source: "PreDefined"
            })
        }
    }

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
                if (normaliseString(name).includes(lowerQuery)) {
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
    const filteredCacheFiles = Object.values(cachedFolderData).flatMap(list => list.filter(item => normaliseString(item.name).startsWith(lowerQuery)));
    const uniqueFiles = Array.from(
        new Map(filteredCacheFiles.map(item => [item.name, item])).values()
    );

    const searchResults = (await Promise.all(dirSearchPromises)).flat();
    return [...suggestedFolders, ...searchResults,...uniqueFiles];
}

