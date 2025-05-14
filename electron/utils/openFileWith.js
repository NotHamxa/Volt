import fs from "fs";
import {shell} from "electron";
import {spawn} from "node:child_process";

export function openFileWith(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        console.error(`File does not exist: ${filePath}`);
        return;
    }
    const normalizedPath = filePath.replaceAll('/', '\\');
    const command = 'powershell';
    const args = ['-Command', `rundll32.exe shell32.dll,OpenAs_RunDLL "${normalizedPath}"`];
    const childProcess = spawn(command, args, { stdio: 'ignore' });
    childProcess.on('error', (error) => {
        console.error('Failed to start process:', error);
    });

    childProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Process exited with code ${code}`);
        }
    });
}
