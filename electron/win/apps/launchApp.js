import {exec} from "child_process";
import {recordLaunch} from "../../universal/usage.js";

export async function launchApp(app,admin) {
    if (!app) return false;
    try {
        if (app.source === "Steam" && app.appId) {
            exec(`start "" "steam://rungameid/${app.appId}"`, err => { if (err) console.error('Steam launch failed:', err); });
        } else if (app.path) {
            if (admin) {
                const command = `powershell -NoProfile -Command "Start-Process -FilePath \\"${app.path}\\" -Verb RunAs"`;
                exec(command, err => { if (err) console.error('Admin launch failed:', err); });
            } else {
                exec(`start "" "${app.path}"`, err => { if (err) console.error('Regular launch failed:', err); });
            }
        } else if (app.source === "UWP" && app.appId) {
            exec(`start shell:AppsFolder\\${app.appId}`, err => { if (err) console.error('UWP launch failed:', err); });
        } else {
            return false;
        }

        recordLaunch(app);
        return true;
    } catch (err) {
        return false;
    }
}
