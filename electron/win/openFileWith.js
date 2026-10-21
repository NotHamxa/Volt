import fs from "fs";
import {spawn} from "node:child_process";

export function openFileWith(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return;
    }
    const normalizedPath = filePath.replaceAll('/', '\\');
    // rundll32 directly, with the path as its own argument. Going through
    // PowerShell put the path inside a double-quoted string, where $(...) and
    // $vars expand — a file named "$(Start-Process calc).txt" ran calc.
    const childProcess = spawn("rundll32.exe", ["shell32.dll,OpenAs_RunDLL", normalizedPath], { stdio: 'ignore' });
    childProcess.on('error', (error) => {
        console.error('Failed to start process:', error);
    });

    childProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Process exited with code ${code}`);
        }
    });
}
