import {exec} from "child_process";
import {showNotification} from "./notification.js";

const commandNotifications = {
    "Shutdown":                     { icon: '⏻',  title: 'Shutting down...',           message: 'Your PC will shut down shortly' },
    "Restart":                      { icon: '↺',  title: 'Restarting...',              message: 'Your PC will restart shortly' },
    "Sleep":                        { icon: '🌙', title: 'Going to sleep...',           message: 'Your PC will sleep shortly' },
    "Hibernate":                    { icon: '💤', title: 'Hibernating...',              message: 'Your session will be saved' },
    "Lock Screen":                  { icon: '🔒', title: 'Screen locked',              message: 'Sign in to continue' },
    "Sign Out":                     { icon: '🚪', title: 'Signing out...',              message: 'Your session is ending' },
    "Open Recycle Bin":             { icon: '🗑️', title: 'Recycle Bin opened',         message: '' },
    "Empty Recycle Bin":            { icon: '🗑️', title: 'Recycle Bin emptied',        message: 'All deleted files removed' },
    "Display - PC Screen Only":     { icon: '🖥️', title: 'Display: PC screen only',    message: 'External displays disconnected' },
    "Display - Duplicate":          { icon: '🖥️', title: 'Display: Duplicating',       message: 'Mirroring to all screens' },
    "Display - Extend":             { icon: '🖥️', title: 'Display: Extended',          message: 'Desktop extended across screens' },
    "Display - Second Screen Only": { icon: '🖥️', title: 'Display: Second screen only',message: 'Main display disconnected' },
    "Minimize All Windows":         { icon: '⬇️', title: 'All windows minimized',      message: '' },
    "Restart Windows Explorer":     { icon: '📁', title: 'Explorer restarted',         message: 'Windows Explorer has been restarted' },
    "Flush DNS Cache":              { icon: '🌐', title: 'DNS cache flushed',           message: 'DNS resolver cache cleared' },
    "Show IP Configuration":        { icon: '🌐', title: 'IP Configuration',            message: 'Opening network details...' },
    "Open Network Settings":        { icon: '🌐', title: 'Network Settings',            message: 'Opening network settings...' },
    "Show WiFi Profiles":           { icon: '📶', title: 'WiFi Profiles',               message: 'Opening saved WiFi profiles...' },
    "Open Windows Terminal":        { icon: '⌨️', title: 'Terminal opened',             message: '' },
    "Open System Properties":       { icon: '⚙️', title: 'System Properties',           message: 'Opening system properties...' },
    "Open System Restore":          { icon: '⚙️', title: 'System Restore',              message: 'Opening system restore...' },
};

export function sendCommandNotification(commandName) {
    const notif = commandNotifications[commandName] ?? { icon: '⚡', title: commandName, message: 'Command executed' };
    showNotification({ icon: notif.icon, title: notif.title, message: notif.message });
}

export async function executeCommand(item){
    return new Promise((resolve) => {
        exec(item.path, { shell: "cmd.exe" }, (error) => {
            if (error) console.error(`Command failed: ${item.path}`, error);
            sendCommandNotification(item.name);
            resolve(!error);
        });
    });
}