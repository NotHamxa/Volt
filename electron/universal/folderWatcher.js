import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { isExcludedPath } from "./folderCache.js";

// Watches indexed folders with one native recursive handle per root instead of
// chokidar's handle-per-file. A folder with tens of thousands of files would
// otherwise open that many watchers on the main thread and freeze the app.
//
// Emits:
//   "add"    (filePath) — a file appeared
//   "remove" (fullPath) — a file or directory is gone (we can't tell which
//                          after the fact, so listeners treat it as a prefix)
export class FolderWatcher extends EventEmitter {
    #watchers = new Map();

    add(roots) {
        for (const root of [].concat(roots)) {
            if (this.#watchers.has(root)) continue;
            let watcher;
            try {
                watcher = fs.watch(root, { recursive: true, persistent: true });
            } catch (err) {
                console.warn("Can't watch folder:", root, err.message);
                continue;
            }
            watcher.on("change", (_, filename) => {
                if (filename) this.#handle(root, filename.toString());
            });
            watcher.on("error", err => {
                // Typically the root itself was deleted or became unreachable.
                console.warn("Folder watcher error:", root, err.message);
                this.unwatch(root);
                if (!fs.existsSync(root)) this.emit("remove", root);
            });
            this.#watchers.set(root, watcher);
        }
    }

    unwatch(root) {
        this.#watchers.get(root)?.close();
        this.#watchers.delete(root);
    }

    #handle(root, relPath) {
        if (isExcludedPath(relPath)) return;
        const fullPath = path.join(root, relPath);
        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch {
            this.emit("remove", fullPath);
            return;
        }
        if (stat.isFile()) this.emit("add", fullPath);
    }
}
