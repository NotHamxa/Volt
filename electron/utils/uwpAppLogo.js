import path from "path";
import {execFile} from "node:child_process";
import fs from "fs";


export async function getUwpAppIcon(uwpApp, appIconsCache) {
    try {
        const cachedIconPath = appIconsCache[uwpApp.name];
        console.log(cachedIconPath, uwpApp.name);
        if (cachedIconPath && fs.existsSync(cachedIconPath)) {
            const imageBuffer = fs.readFileSync(cachedIconPath);
            const base64 = imageBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        }
        return null;

    } catch (error) {
        console.error(`Failed to get icon for ${uwpApp.name}:`, error);
        return null;
    }
}
export async function getUwpInstallLocations(uwpApps) {
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

