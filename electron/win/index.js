// ─────────────────────────────────────────────────────────────────────────────
// Windows platform implementation.
//
// This barrel is the full contract of platform-specific operations that the
// universal code (electron/universal, electron/ipc, electron/main.js) depends
// on. Everything is reached through electron/platform.js, never imported from
// here directly. To port Volt to another OS, create a sibling folder (e.g.
// electron/linux) that exports this exact same set of names, then point
// electron/platform.js at it.
// ─────────────────────────────────────────────────────────────────────────────

// App catalog: enumerate installed apps + cache their icons.
export { appWatchPaths } from "./apps/enumerate.js";
export { loadAppData, revalidateAppIcons } from "./appCatalog.js";

// Launching apps and fetching their icons on demand.
export { launchApp } from "./apps/launchApp.js";
export { getAppLogo } from "./apps/appLogo.js";
export { getUwpAppIcon } from "./apps/uwpAppLogo.js";
export { getSteamGameIcon } from "./apps/steam.js";

// Running user/system commands.
export { executeCommand } from "./runCommand.js";
export { executeUserCommand } from "./cmd.js";

// File-level OS integrations.
export { openFileWith } from "./openFileWith.js";
export { copyFileToClipboard } from "./clipboard.js";

// Foreground-window tracking (restore focus to the previous app when Volt hides).
export {
    initWindowFocusTracker,
    setOwnWindowHandle,
    captureForegroundWindow,
    restoreForegroundWindow,
} from "./windowFocus.js";
