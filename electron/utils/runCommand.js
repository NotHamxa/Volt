import { Notification } from "electron";
import {exec} from "child_process";

function getCommandSuccessMessage(commandName) {
    switch (commandName) {
        case "Shutdown":                     return "Shutting down...";
        case "Restart":                      return "Restarting...";
        case "Sleep":                        return "Going to sleep...";
        case "Hibernate":                    return "Hibernating...";
        case "Lock Screen":                  return "Screen locked";
        case "Sign Out":                     return "Signing out...";
        case "Open Recycle Bin":             return "Recycle Bin opened";
        case "Empty Recycle Bin":            return "Recycle Bin emptied";
        case "Display - PC Screen Only":     return "Display: PC screen only";
        case "Display - Duplicate":          return "Display: Duplicating";
        case "Display - Extend":             return "Display: Extended";
        case "Display - Second Screen Only": return "Display: Second screen only";
        case "Minimize All Windows":         return "All windows minimized";
        case "Restart Windows Explorer":     return "Explorer restarted";
        case "Flush DNS Cache":              return "DNS cache flushed";
        case "Show IP Configuration":        return "Opening IP config...";
        case "Open Network Settings":        return "Opening Network Settings...";
        case "Show WiFi Profiles":           return "Opening WiFi profiles...";
        case "Open Windows Terminal":        return "Terminal opened";
        case "Open System Properties":       return "Opening System Properties...";
        case "Open System Restore":          return "Opening System Restore...";
        default:                             return `${commandName} executed`;
    }
}

export function sendCommandNotification(commandName, success) {
    console.log(Notification.isSupported());
    if (!Notification.isSupported()) return;

    const notification = new Notification({
        title: success ? commandName : "Command Failed",
        body: success ? getCommandSuccessMessage(commandName) : `Failed to run: ${commandName}`,
        silent: true,
    });

    notification.show();
    console.log("Showed")
}

export async function executeCommand(item){
    return new Promise((resolve) => {
        exec(item.path, { shell: "cmd.exe" }, (error) => {
            const success = !error;
            if (error) console.error(`Command failed: ${item.path}`, error);
            sendCommandNotification(item.name, success);
            resolve(success);
        });
    });
}