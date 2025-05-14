import {exec} from "child_process";
import path from "path";
import {execFile} from "node:child_process";
import fs from "fs";
import os from "os";
import xml2js from "xml2js";
import {fileURLToPath} from "url";
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);
const appDataPath = path.join(__dirname, 'appData/icons');
export async function getUwpAppIcon(uwpApps) {
    const temp = await getUwpInstallLocations(uwpApps);
    for (const uwpApp of temp) {
        if (uwpApp.installLocation && uwpApp.name==="Paint"){
            cacheUwpIcon(uwpApp.installLocation,uwpApp.name);
            console.log(uwpApp.name);
            return
        }
    }
    console.log(await getUwpInstallLocations(uwpApps));
}
function getUwpInstallLocations(uwpApps) {
    return new Promise((resolve, reject) => {
        const ids = uwpApps
            .filter(app => app.appId.includes("!"))
            .map(app => `'${app.appId.replace(/'/g, "''")}'`)
            .join(",");

        const psScript = `
$apps = @(${ids})
$result = @()

foreach ($appId in $apps) {
    if ($appId -match "^(?<family>.+?)!(?<id>.+)$") {
        $pf = $Matches.family
        $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $pf }
        if ($pkg) {
            $result += [PSCustomObject]@{
                AppUserModelId = $appId
                InstallLocation = $pkg.InstallLocation
            }
        }
    }
}

$result | ConvertTo-Json -Compress
        `.trim();

        execFile("powershell.exe", ["-NoProfile", "-Command", psScript], { encoding: "utf8", maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                return reject(new Error(`PowerShell error: ${stderr || err.message}`));
            }

            let locations = [];
            try {
                locations = JSON.parse(stdout);
                if (!Array.isArray(locations)) {
                    locations = [locations];
                }
            } catch (parseErr) {
                return reject(new Error("Failed to parse PowerShell JSON output"));
            }

            const result = uwpApps.map(app => {
                const match = locations.find(loc => loc.AppUserModelId === app.appId);
                return {
                    ...app,
                    installLocation: match ? match.InstallLocation : null
                };
            });

            resolve(result);
        });
    });
}
async function cacheUwpIcon(installPath, name) {
    const manifestPath = path.join(installPath, "AppxManifest.xml");

    if (!fs.existsSync(manifestPath)) {
        console.warn(`Manifest not found for ${name}`);
        return null;
    }

    const xml = fs.readFileSync(manifestPath, "utf8");
    const manifest = await xml2js.parseStringPromise(xml, { explicitArray: false });

    // VisualElements may be nested under Application > VisualElements
    const applications = manifest.Package.Applications.Application;
    const visual = applications["uap:VisualElements"] || applications["VisualElements"];
    if (!visual) {
        console.warn(`No VisualElements found for ${name}`);
        return null;
    }
    const iconRel = visual.Square44x44Logo || visual.Logo;
    if (!iconRel) {
        console.warn(`No icon path found in manifest for ${name}`);
        return null;
    }
    const baseName = iconRel.replace(/\\/g, "/").replace(/\.[^/.]+$/, ""); // remove extension
    const candidatePaths = [
        `${baseName}.scale-200.png`,
        `${baseName}.scale-100.png`,
        `${baseName}.png`,
    ];

    let iconPath = null;
    for (const relPath of candidatePaths) {
        const fullPath = path.join(installPath, relPath);
        if (fs.existsSync(fullPath)) {
            iconPath = fullPath;
            break;
        }
    }

    if (!iconPath) {
        console.warn(`Icon file not found for ${name}`);
        return null;
    }
    const destPath = path.join(appDataPath, `${name}.png`);
    fs.mkdirSync(appDataPath, { recursive: true });
    fs.copyFileSync(iconPath, destPath);
    return destPath;
}
