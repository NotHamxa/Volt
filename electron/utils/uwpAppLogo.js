import {exec} from "child_process";
import fsPromises from "fs/promises";
import sharp from "sharp";

export async function getUwpAppIconBase64(appNameMatch) {
    return new Promise((resolve, reject) => {
        const script = `
        Get-AppxPackage | ForEach-Object {
            $manifestPath = "$($_.InstallLocation)\\AppxManifest.xml"
            if (Test-Path $manifestPath) {
                $xml = [xml](Get-Content $manifestPath)
                $logo = $xml.Package.Applications.Application.VisualElements.Square150x150Logo
                if ($logo) {
                    $logoPath = Join-Path $_.InstallLocation $logo
                    [PSCustomObject]@{
                        Name = $_.Name
                        LogoPath = $logoPath
                    }
                }
            }
        } | ConvertTo-Json
        `;

        exec(`powershell -Command "${script}"`, async (err, stdout) => {
            if (err) return reject(err);
            try {
                const data = JSON.parse(stdout);
                const appList = Array.isArray(data) ? data : [data];
                const app = appList.find(a => a.Name.toLowerCase().includes(appNameMatch.toLowerCase()));
                if (!app) return reject(new Error("UWP app not found"));

                const buffer = await fsPromises.readFile(app.LogoPath);
                const png = await sharp(buffer).png().toBuffer();
                const base64 = png.toString('base64');
                resolve(`data:image/png;base64,${base64}`);
            } catch (e) {
                reject(new Error(`Failed to process UWP icon: ${e.message}`));
            }
        });
    });
}
