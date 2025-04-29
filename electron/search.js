const {ipcMain} = require('electron');

const fg = require('fast-glob');
const fs = require('fs');

const appPaths = [
    'C:/ProgramData/Microsoft/Windows/Start Menu/Programs',
    `${process.env.APPDATA}\\Microsoft\\Windows\\Start Menu\\Programs`
];

async function searchApps(query) {
    const results = [];
    for (const base of appPaths) {
        const matches = await fg([`**/*${query}*.lnk`], {
            cwd: base,
            absolute: true,
            suppressErrors: true
        });
        results.push(...matches);
    }
    return results;
}

async function searchFilesAndFolders(baseDir, query) {
    const matches = await fg([`**/*${query}*`], {
        cwd: baseDir,
        absolute: true,
        onlyFiles: false,
        suppressErrors: true
    });

    const files = [];
    const folders = [];

    for (const fullPath of matches) {
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) files.push(fullPath);
            else if (stat.isDirectory()) folders.push(fullPath);
        } catch (err) {
            // Ignore inaccessible paths
        }
    }

    return { files, folders };
}
ipcMain.handle('search-files', async (_, dir, pattern) => {
    return await searchFilesAndFolders(dir, pattern);
});

ipcMain.handle('search-apps', async (_, pattern) => {
    return await searchApps(pattern);
});

module.exports = {searchApps,searchFilesAndFolders}
