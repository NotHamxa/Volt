import path from "path";
import fs from "fs";
import { app } from "electron";
import { getPrefs } from "./prefs.js";

/**
 * The directory CLI providers run in.
 *
 * Without this they inherit process.cwd(): the repo during development, and
 * whatever directory the executable happened to be launched from once packaged
 * — neither of which the user chose. Claude runs with permissions bypassed and
 * Codex can be switched to workspace-write, so an unintended root is a real
 * hazard, not just untidy.
 *
 * The default is a dedicated folder under userData, so file work starts
 * somewhere inert. Point it at a project deliberately if you want that.
 */
export function defaultWorkspace() {
    return path.join(app.getPath("userData"), "ai-workspace");
}

export function workspaceDir() {
    const chosen = getPrefs().workspace;
    const dir = chosen || defaultWorkspace();
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return dir;
    } catch {
        // A configured directory that has since gone away must not take the
        // provider down with it.
        const fallback = defaultWorkspace();
        try { fs.mkdirSync(fallback, { recursive: true }); } catch { /* best effort */ }
        return fallback;
    }
}
