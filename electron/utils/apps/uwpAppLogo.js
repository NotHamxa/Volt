import {execFile} from "node:child_process";
import fs from "fs";

const PACKAGES_REG_KEY = "HKCR\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";

function regQuery(args) {
    return new Promise((resolve, reject) => {
        execFile("reg.exe", ["query", ...args], {encoding: "utf8", timeout: 10000, windowsHide: true}, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout || "");
        });
    });
}

function parseRegValues(output) {
    const values = {};
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s+REG_\w+\s+(.*)$/);
        if (match) {
            values[match[1]] = match[2].trim();
        }
    }
    return values;
}

export async function getUwpAppIcon(uwpApp, appIconsCache) {
    try {
        const cachedIconPath = appIconsCache[uwpApp.name];
        if (cachedIconPath && fs.existsSync(cachedIconPath)) {
            const imageBuffer = fs.readFileSync(cachedIconPath);
            const base64 = imageBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        }
        return null;

    } catch (error) {
        return null;
    }
}

export async function getUwpInstallLocations(uwpApps) {
    const appsWithId = uwpApps.filter(a => a.appId && a.appId.includes("!"));
    if (appsWithId.length === 0) {
        return uwpApps.map(a => ({...a, installLocation: null}));
    }

    // Parse family names from appIds
    // appId: "4DF9E0F8.Netflix_mcm4njqhnhss8!App"
    // familyName: "4DF9E0F8.Netflix_mcm4njqhnhss8"
    // Registry key: "4DF9E0F8.Netflix_7.0.8.0_neutral__mcm4njqhnhss8"
    // Match: key starts with namePrefix + "_" and ends with publisherHash
    const familyInfos = appsWithId.map(a => {
        const familyName = a.appId.split("!")[0];
        const lastUnderscore = familyName.lastIndexOf("_");
        return {
            app: a,
            namePrefix: familyName.substring(0, lastUnderscore),
            publisherHash: familyName.substring(lastUnderscore + 1),
        };
    });

    try {
        // List all package subkeys in one reg call
        const output = await regQuery([PACKAGES_REG_KEY]);
        const subkeys = output.split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l.startsWith("HKEY_"));

        // Match each app's family name to a registry key
        const matched = familyInfos.map(info => {
            const regKey = subkeys.find(key => {
                const keyName = key.substring(key.lastIndexOf("\\") + 1);
                return keyName.startsWith(info.namePrefix + "_") && keyName.endsWith(info.publisherHash);
            });
            return {app: info.app, regKey};
        });

        // Query PackageRootFolder for each match in parallel
        const resolved = await Promise.all(
            matched.map(async ({app, regKey}) => {
                if (!regKey) return {...app, installLocation: null};
                try {
                    const valuesOutput = await regQuery([regKey, "/v", "PackageRootFolder"]);
                    const values = parseRegValues(valuesOutput);
                    return {...app, installLocation: values.PackageRootFolder || null};
                } catch {
                    return {...app, installLocation: null};
                }
            })
        );

        // Build lookup from resolved results, then map over all input apps
        const lookup = new Map(resolved.map(r => [r.appId, r.installLocation]));
        return uwpApps.map(a => ({
            ...a,
            installLocation: lookup.get(a.appId) ?? null
        }));

    } catch (err) {
        console.warn("Registry UWP lookup failed:", err.message);
        return uwpApps.map(a => ({...a, installLocation: null}));
    }
}
