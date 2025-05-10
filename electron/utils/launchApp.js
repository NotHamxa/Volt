import {exec} from "child_process";


export async function launchApp(app,admin) {
    if (!app) return false;
    try {
        if (app.path) {
            if (admin) {
                const command = `powershell -Command "Start-Process -FilePath \\"${app.path}\\" -Verb RunAs"`;
                exec(command, err => { if (err) console.error('Admin launch failed:', err); });
            } else {
                exec(`start "" "${app.path}"`, err => { if (err) console.error('Regular launch failed:', err); });
            }
        } else if (app.source === "UWP" && app.appId) {
            exec(`start shell:AppsFolder\\${app.appId}`, err => { if (err) console.error('UWP launch failed:', err); });
        } else {
            return false;
        }
        return true;
    } catch (err) {
        console.error('Launch error:', err);
        return false;
    }
}
