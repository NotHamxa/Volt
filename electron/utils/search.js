import path from "path";
import os from "os";
import settings from "../data/settings.json" with { type: 'json' };
import commands from "../data/commands.json" with { type: 'json' };
const normaliseString = (str) => {
    return str.toLowerCase().replace(/\s+/g, "");
}

export async function searchApps(appCache,query) {
    if (!appCache || !Array.isArray(appCache)) return [];
    const lowerQuery = normaliseString(query).trim();
    const resultsMap = new Map();
    for (const app of appCache) {
        if (normaliseString(app.name).includes(lowerQuery)) {
            resultsMap.set(app.name, app);
        }
    }
    return Array.from(resultsMap.values());
}

export async function searchSettings(query) {
    if (!settings) return [];
    const lowerQuery = normaliseString(query).trim();
    const resultsMap = new Map();
    for (const setting of settings){
        if (normaliseString(setting.name).includes(lowerQuery)) {
            resultsMap.set(setting.name, setting);
        }
    }
    return Array.from(resultsMap.values());
}
export async function searchCommands(query) {
    if (!commands) return [];
    const lowerQuery = normaliseString(query).trim();
    const resultsMap = new Map();
    for (const command of commands){
        if (normaliseString(command.name).includes(lowerQuery)) {
            resultsMap.set(command.name, command);
        }
    }
    return Array.from(resultsMap.values());
}
export async function searchFilesAndFolders(baseDir, query, cachedFolderData) {
    const lowerQuery = normaliseString(query).trim();
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
    const resultsMap = new Map();
    const secondMap = new Map();
    for (const list of Object.values(cachedFolderData)) {
        for (const item of list) {
            if (!item._normalizedName) {
                item._normalizedName = normaliseString(item.name);
            }

            if (item._normalizedName.startsWith(lowerQuery)) {
                if (!resultsMap.has(item.name)) {
                    resultsMap.set(item.name, item);
                }
            }
            else if (item._normalizedName.includes(lowerQuery)) {
                if (!secondMap.has(item.name)) {
                    secondMap.set(item.name, item);
                }
            }
        }
    }
    return [...suggestedFolders,...Array.from(resultsMap.values()),...Array.from(secondMap.values())];
}

