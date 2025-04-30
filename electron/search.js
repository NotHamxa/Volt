import fg from 'fast-glob';
import fs from 'fs';

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
    console.log(results);
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

        }
    }
    console.log({files,folders})
    return { files, folders };
}


module.exports = {searchApps,searchFilesAndFolders}
