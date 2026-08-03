import { spawn } from 'child_process';

// Runs a user-typed `!cmd` line in a visible console. Arbitrary execution is
// the point of this feature, but the command must not be able to break out of
// the string we hand to cmd.exe — a stray `"` would otherwise let the tail of
// the line run as separate commands.
//
// `start "" cmd /k <cmd>` detaches into a new console window. The empty title
// arg stops `start` treating a quoted first token as the window title. Args are
// passed as an array so Node quotes them individually instead of us building a
// shell string by hand.
export const executeUserCommand = (cmd) => {
    if (typeof cmd !== "string" || !cmd.trim()) return false;

    const child = spawn("cmd.exe", ["/c", "start", "", "cmd.exe", "/k", cmd], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        windowsVerbatimArguments: false,
    });

    child.on("error", (error) => {
        console.error(`Failed to run user command: ${error.message}`);
    });
    child.unref();
    return true;
};
