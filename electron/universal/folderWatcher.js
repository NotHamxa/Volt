import path from "path";
import { EventEmitter } from "events";
import parcelWatcher from "@parcel/watcher";
import { isExcludedPath, excludedFolders } from "./folderCache.js";

// Native recursive watch on its own thread: one subscription per root, no
// per-file handles, and no events dropped when a burst (an extracted archive,
// a git clone) overflows the OS change buffer — fs.watch loses most of those.
// Resolves to the subscription, or null if the folder can't be watched.
export function watchTree(root, onEvents, ignore = []) {
    return parcelWatcher
        .subscribe(root, (err, events) => {
            if (err) console.warn("Watcher error:", root, err.message ?? err);
            else onEvents(events);
        // Named explicitly: left to auto-detect, parcel first probes for
        // watchman by spawning a shell, blocking the main thread ~0.5s.
        }, { ignore, backend: "windows" })
        .catch(err => {
            console.warn("Can't watch folder:", root, err.message ?? err);
            return null;
        });
}

// Keeps parcel from even scanning excluded trees (node_modules etc.) on subscribe.
const IGNORE_GLOBS = excludedFolders.flatMap(f => [`**/${f}`, `**/${f}/**`]);

// Watches indexed folders. Emits per batch:
//   "add"    (root, paths) — files or folders that appeared
//   "remove" (root, paths) — files or folders that are gone; a folder's
//                            contents aren't listed individually
export class FolderWatcher extends EventEmitter {
    #subscriptions = new Map();

    add(roots) {
        for (const root of [].concat(roots)) {
            if (this.#subscriptions.has(root)) continue;
            this.#subscriptions.set(root, watchTree(root, events => this.#handle(root, events), IGNORE_GLOBS));
        }
    }

    async unwatch(root) {
        const subscription = this.#subscriptions.get(root);
        this.#subscriptions.delete(root);
        await (await subscription)?.unsubscribe().catch(() => {});
    }

    #handle(root, events) {
        const added = [];
        const removed = [];
        for (const { type, path: fullPath } of events) {
            if (isExcludedPath(path.relative(root, fullPath))) continue;
            if (type === "create") added.push(fullPath);
            else if (type === "delete") removed.push(fullPath);
        }
        if (removed.length) this.emit("remove", root, removed);
        if (added.length) this.emit("add", root, added);
    }
}
