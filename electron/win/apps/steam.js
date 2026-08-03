import {execFile} from "node:child_process";
import fs from "fs";
import path from "path";

const STEAM_REG_KEY = "HKCU\\Software\\Valve\\Steam";

function getSteamPath() {
    return new Promise((resolve) => {
        execFile("reg.exe", ["query", STEAM_REG_KEY, "/v", "SteamPath"],
            {encoding: "utf8", timeout: 5000, windowsHide: true},
            (err, stdout) => {
                if (err) return resolve(null);
                const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
                resolve(match ? match[1].trim() : null);
            }
        );
    });
}

function parseVdfString(content) {
    const result = {};
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^\s*"([^"]+)"\s+"([^"]*)"\s*$/);
        if (match) {
            result[match[1]] = match[2];
        }
    }
    return result;
}

function getLibraryFolders(steamPath) {
    const vdfPath = path.join(steamPath, "steamapps", "libraryfolders.vdf");
    if (!fs.existsSync(vdfPath)) return [steamPath];

    const content = fs.readFileSync(vdfPath, "utf8");
    const paths = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^\s*"path"\s+"([^"]+)"\s*$/);
        if (match) {
            paths.push(match[1].replace(/\\\\/g, "\\"));
        }
    }
    return paths.length > 0 ? paths : [steamPath];
}

// Steam internal packages that aren't launchable games
const STEAM_EXCLUDED_APPIDS = new Set([
    "228980",  // Steamworks Common Redistributables
]);

function getInstalledGames(libraryPaths) {
    const games = [];
    for (const libPath of libraryPaths) {
        const appsDir = path.join(libPath, "steamapps");
        if (!fs.existsSync(appsDir)) continue;

        let files;
        try {
            files = fs.readdirSync(appsDir);
        } catch {
            continue;
        }

        for (const file of files) {
            if (!file.startsWith("appmanifest_") || !file.endsWith(".acf")) continue;
            try {
                const content = fs.readFileSync(path.join(appsDir, file), "utf8");
                const data = parseVdfString(content);
                if (data.appid && data.name && !STEAM_EXCLUDED_APPIDS.has(data.appid)) {
                    games.push({
                        name: data.name,
                        type: "app",
                        source: "Steam",
                        appId: data.appid,
                        path: `steam://rungameid/${data.appid}`,
                    });
                }
            } catch {
                continue;
            }
        }
    }
    return games;
}

export async function loadSteamGames() {
    try {
        const steamPath = await getSteamPath();
        if (!steamPath) return [];

        const libraryPaths = getLibraryFolders(steamPath);
        return getInstalledGames(libraryPaths);
    } catch (err) {
        console.warn("Failed to load Steam games:", err.message);
        return [];
    }
}

export async function getSteamGameIcon(appId, steamPath) {
    if (!steamPath) {
        steamPath = await getSteamPath();
    }
    if (!steamPath) return null;

    const cacheDir = path.join(steamPath, "appcache", "librarycache", appId);
    if (!fs.existsSync(cacheDir)) return null;

    // Prefer logo.png (transparent), then header.jpg, then any hash-named .jpg (small icon)
    const candidates = ["logo.png", "header.jpg"];
    for (const file of candidates) {
        const filePath = path.join(cacheDir, file);
        if (fs.existsSync(filePath)) {
            return readIconFile(filePath);
        }
    }

    // Fallback: find any .jpg file in the cache dir (hash-named icon files)
    try {
        const files = fs.readdirSync(cacheDir);
        const jpgFile = files.find(f => f.endsWith(".jpg"));
        if (jpgFile) {
            return readIconFile(path.join(cacheDir, jpgFile));
        }
    } catch {
        // ignore
    }

    return null;
}

function readIconFile(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).substring(1);
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
        return null;
    }
}

export async function cacheSteamPath() {
    return await getSteamPath();
}
