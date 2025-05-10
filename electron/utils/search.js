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
    const baseDirs = [path.join(os.homedir(), "Downloads")];
    if (baseDir!==""){
        baseDirs.push(baseDir);
    }
    const lowerQuery = query.toLowerCase();
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
                        path: fullPath
                    }];
                }
            } catch {
                // Ignore error
            }
            return [];
        });
    });
    return (await Promise.all(dirSearchPromises)).flat();
}
