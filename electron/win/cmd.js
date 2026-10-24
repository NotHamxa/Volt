import { spawn } from 'child_process';

// Characters the outer cmd.exe would act on when they're outside quotes.
const CMD_SPECIAL = /[&|<>()^]/;

/**
 * Makes `cmd` pass through the outer `cmd /c start …` untouched, so the inner
 * console parses it exactly as if it had been typed there.
 *
 * Node's own quoting escapes inner quotes as `\"`, which cmd doesn't
 * understand: `echo "a & b"` came out with the `&` unquoted and ran the tail
 * in the hidden outer shell. Instead, track cmd's quote state (a plain toggle
 * on `"`) and caret-escape specials only where the outer shell would see them
 * unquoted. The outer strips exactly those carets, leaving the text as typed.
 */
export function escapeForOuterCmd(cmd) {
    let out = "";
    let quoted = false;
    for (const c of cmd.replace(/[\r\n]+/g, " ")) {
        if (c === '"') quoted = !quoted;
        else if (!quoted && CMD_SPECIAL.test(c)) out += "^";
        out += c;
    }
    return out;
}

// Runs a user-typed `!cmd` line in a visible console. Arbitrary execution is
// the point of this feature, but the command must reach that console intact,
// not be split up by the hidden cmd.exe that opens it.
//
// `start "" cmd /k <cmd>` detaches into a new console window. The empty title
// arg stops `start` treating a quoted first token as the window title. The
// command line is built by hand (verbatim) because Node's argument quoting is
// for C runtimes, not cmd.
export const executeUserCommand = (cmd) => {
    if (typeof cmd !== "string" || !cmd.trim()) return false;

    const child = spawn("cmd.exe", [`/d /c start "" cmd.exe /k ${escapeForOuterCmd(cmd)}`], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        windowsVerbatimArguments: true,
    });

    child.on("error", (error) => {
        console.error(`Failed to run user command: ${error.message}`);
    });
    child.unref();
    return true;
};
