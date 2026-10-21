import path from "path";
import fs from "fs";
import os from "os";
import { execFile, execFileSync } from "child_process";

/**
 * Finding and stopping the CLIs the subscription providers drive.
 *
 * Discovery: a fixed list of install folders missed the most common install of
 * all — `npm i -g` puts only .cmd/.ps1 shims in %APPDATA%\npm, never an .exe —
 * and nothing searched PATH. A .cmd can't be spawned without a shell, and with
 * one the prompt's quoting becomes a command-injection problem, so a shim is
 * read for the script it launches and that is run with node directly.
 *
 * Stopping: child.kill() on Windows ends one process, not the tree. The
 * commands a CLI started on the model's behalf kept running after Stop.
 */

const WIN = process.platform === "win32";

/** Folders to search, in order: PATH, then where installers put things. */
function searchDirs() {
    const dirs = (process.env.PATH ?? "").split(path.delimiter);
    // PATH is frozen at launch, so a CLI installed since then is only found
    // through the folder its installer uses.
    if (WIN) {
        dirs.push(path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "npm"));
    }
    return [...new Set(dirs.map(d => d.trim().replace(/^"|"$/g, "")).filter(Boolean))];
}

function isFile(file) {
    try {
        return fs.statSync(file).isFile();
    } catch {
        return false;
    }
}

/** First `name` (with Windows extensions) found in the given folders. */
function findOnPath(name, exts) {
    for (const dir of searchDirs()) {
        for (const ext of exts) {
            const file = path.join(dir, name + ext);
            if (isFile(file)) return file;
        }
    }
    return null;
}

/**
 * The script or executable an npm .cmd shim launches. Both shim generations
 * write it as a quoted path under the shim's own folder: `"%dp0%\…"` (current)
 * or `"%~dp0\…"` (older). The last such path on the line is the target — the
 * first is the node.exe check.
 */
function shimTarget(shim) {
    let text;
    try {
        text = fs.readFileSync(shim, "utf8");
    } catch {
        return null;
    }
    const matches = [...text.matchAll(/"%~?dp0%?\\([^"%]+?\.(?:c?js|mjs|exe))"/gi)]
        .map(m => m[1])
        .filter(rel => !/^node\.exe$/i.test(rel));
    const rel = matches.at(-1);
    if (!rel) return null;
    const target = path.join(path.dirname(shim), rel);
    return isFile(target) ? target : null;
}

/** node to run a shimmed script with — the shim's own, then PATH's, then ours. */
function nodeFor(shim) {
    const beside = path.join(path.dirname(shim), "node.exe");
    if (isFile(beside)) return { command: beside, env: {} };
    const onPath = findOnPath("node", WIN ? [".exe"] : [""]);
    if (onPath) return { command: onPath, env: {} };
    // Electron is a node runtime when asked to be. Last resort only: the
    // variable is inherited by everything the CLI spawns in turn.
    return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } };
}

/** Turns a found file into something spawnable without a shell. */
function launchSpec(file) {
    if (!WIN || !/\.(cmd|bat)$/i.test(file)) {
        return { path: file, command: file, args: [], env: {} };
    }
    const target = shimTarget(file);
    if (!target) return null;
    if (/\.exe$/i.test(target)) return { path: target, command: target, args: [], env: {} };
    const node = nodeFor(file);
    return { path: target, command: node.command, args: [target], env: node.env, script: target, node: node.command };
}

const cache = new Map();

/**
 * Where a CLI lives and how to start it: `{ path, command, args, env }`, or
 * null. `candidates` are known install locations, checked before PATH.
 *
 * Only a hit is cached, and re-checked on use. Caching the miss meant a CLI
 * installed while Volt was running was never seen — "Re-check" asked again
 * and got the remembered answer.
 */
export function resolveCli(name, candidates = []) {
    const known = cache.get(name);
    if (known && isFile(known.path)) return known;
    cache.delete(name);

    const exts = WIN ? [".exe", ".cmd"] : [""];
    const found = [
        ...candidates.filter(isFile),
        findOnPath(name, exts),
    ].filter(Boolean);

    for (const file of found) {
        const spec = launchSpec(file);
        if (spec) {
            cache.set(name, spec);
            return spec;
        }
    }
    return null;
}

// Every CLI process started for a turn, so quitting can take them all down.
const live = new Set();

export function track(child) {
    live.add(child);
    const forget = () => live.delete(child);
    child.once("exit", forget);
    child.once("error", forget);
    return child;
}

const running = (child) => child && child.exitCode === null && child.signalCode === null;

const taskkill = () => path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");

/**
 * Ends a CLI and everything it started. taskkill /T walks the tree from the
 * parent, so it has to run while the parent is still alive to find it.
 */
export function killTree(child) {
    if (!running(child)) return;
    if (!WIN || !child.pid) {
        try { child.kill("SIGTERM"); } catch { /* already gone */ }
        return;
    }
    execFile(taskkill(), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, (err) => {
        // Access denied or a race with exit; the plain kill is still better
        // than leaving it.
        if (err && running(child)) {
            try { child.kill(); } catch { /* already gone */ }
        }
    });
}

/** Synchronous, for app quit — an async kill would never get to run. */
export function killAllTrees() {
    for (const child of live) {
        if (!running(child)) continue;
        try {
            if (WIN && child.pid) {
                execFileSync(taskkill(), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
            } else {
                child.kill("SIGTERM");
            }
        } catch { /* already gone */ }
    }
    live.clear();
}
