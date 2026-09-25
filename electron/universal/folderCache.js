import path from "path";
import fsp, { readdir } from "fs/promises";
import Store from "electron-store";
import { normaliseString } from "./search.js";

const store = new Store();

const excludedExtensions = [
    // --- OS & system ---
    "sys", "dll", "ocx", "cpl", "drv", "mui", "cat", "efi",
    "kext", "dylib",
    "so", "ko",

    // --- executables & installers ---
    "app", "bin", "run", "out", "elf",
    "deb", "rpm", "pkg", "snap", "flatpak",
    "appx", "msix",

    // --- config & metadata ---
    "ini", "cfg", "conf", "reg", "dat", "inf",
    "plist", "json", "yaml", "yml", "toml","xml",

    // --- cache, temp, logs ---
    "tmp", "temp", "log", "cache", "bak", "old",
    "swp", "swo", "part", "crdownload",

    // --- disk & virtual images ---
    "iso", "img", "dmg", "vhd", "vhdx", "qcow", "raw",

    // --- databases & indexes ---
    "db", "sqlite", "sqlite3", "idx", "index",

    // --- security / certs ---
    "key", "pem", "crt", "cer", "pfx", "p12", "der",
    "gpg", "asc", "sig",

    // --- developer & build artifacts ---
    "o", "obj", "class", "map", "ilk", "lock",

    // --- python interpreter & tooling ---
    "pyc", "pyo", "pyd", "egg", "whl", "manifest", "spec",

];
export const excludedFolders = [
    // IDEs
    ".idea", ".vscode", ".vs", ".eclipse", ".netbeans", ".atom",
    // Python
    ".venv", "venv", "env", ".env", "__pycache__",
    ".pytest_cache", ".tox", ".nox", ".ipynb_checkpoints",
    // Node / deps
    "node_modules", ".npm", ".yarn", ".pnpm", "vendor",
    // Build artifacts
    "build", "dist", "out", "target", "bin", "obj",
    // Cache / logs
    ".cache", ".tmp", "temp", "logs", "log", "coverage", ".nyc_output",
    // VCS
    ".git", ".svn", ".hg",
    // OS noise
    ".DS_Store", "Thumbs.db", "$RECYCLE.BIN", "System Volume Information",
    // Containers / infra
    ".docker", ".vagrant", ".terraform"
];

function isIndexableFile(fileName) {
    const ext = path.extname(fileName).replace(".", "");
    return ext !== "" && !excludedExtensions.includes(ext);
}

// Lets the folder watcher drop events under excluded folders before stat'ing them.
export function isExcludedPath(relPath) {
    return relPath.split(/[\\/]/).some(segment => excludedFolders.includes(segment));
}

function entryFor(fullPath, type) {
    const name = path.basename(fullPath);
    return { name, normalisedName: normaliseString(name), source: "", appId: "", path: fullPath, type };
}

async function readDirRecursive(currentPath, out) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
            if (excludedFolders.includes(entry.name)) continue;
            out.push(entryFor(fullPath, "folder"));
            await readDirRecursive(fullPath, out);
        } else if (entry.isFile()) {
            if (!isIndexableFile(entry.name)) continue;
            out.push(entryFor(fullPath, "file"));
        }
    }
}

// Index entries for a path that just appeared under a watched folder. A folder
// is walked in full — a folder moved or extracted in only reports itself, not
// its contents.
export async function indexPath(fullPath) {
    let stat;
    try { stat = await fsp.stat(fullPath); } catch { return []; }
    if (stat.isFile()) return isIndexableFile(fullPath) ? [entryFor(fullPath, "file")] : [];
    if (!stat.isDirectory() || excludedFolders.includes(path.basename(fullPath))) return [];
    const out = [entryFor(fullPath, "folder")];
    try { await readDirRecursive(fullPath, out); } catch { /* vanished or unreadable mid-walk */ }
    return out;
}

export async function cacheFolder(dirPath,cache,newFolder=true) {
    const filesArray = [];
    await readDirRecursive(dirPath, filesArray);
    cache.cachedFoldersData[dirPath] = filesArray;
    if (newFolder) {
        cache.cachedFolders.push(dirPath);
        store.set("cachedFolders",JSON.stringify(cache.cachedFolders))
    }
    return true
}

export async function deleteFolder(dirPath,cache) {
    if (!cache.cachedFolders.includes(dirPath)) return false;
    const normalPath=dirPath.replace("\\\\","//");
    cache.cachedFoldersData[normalPath] = null;
    delete cache.cachedFoldersData[normalPath];

    cache.cachedFolders = cache.cachedFolders.filter(folder => folder !== dirPath);
    store.set("cachedFolders", JSON.stringify(cache.cachedFolders));
    return true;
}
