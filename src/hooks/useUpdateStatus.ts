import { useEffect, useState } from "react";

export type UpdateState = "idle" | "checking" | "downloading" | "ready" | "uptodate";

export type UpdateStatus = {
    state: UpdateState;
    percent: number;
    check: () => void;
    install: () => void;
};

/**
 * Update state, shared.
 *
 * The preload exposes `onUpdateProgress` and friends as bare `ipcRenderer.on`
 * with no way to detach, so every component that subscribed added a listener
 * that outlived it — remounting the About section stacked another copy each
 * time. Subscribing once at module scope and fanning out to React means the
 * count stays at one however many places read it.
 */
let state: UpdateState = "idle";
let percent = 0;
let started = false;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

function set(next: UpdateState, pct = percent) {
    state = next;
    percent = pct;
    emit();
}

function start() {
    if (started) return;
    started = true;
    window.electron.onUpdateProgress((data: { percent: number }) => {
        set("downloading", Math.round(data.percent));
    });
    window.electron.onUpdateDownloaded(() => set("ready", 100));
    window.electron.onUpdateNotAvailable(() => {
        set("uptodate");
        // Falls back to showing the plain version rather than sitting on a
        // result that stops being news after a couple of seconds.
        setTimeout(() => { if (state === "uptodate") set("idle"); }, 3000);
    });
}

export function useUpdateStatus(): UpdateStatus {
    const [, force] = useState(0);

    useEffect(() => {
        start();
        const listener = () => force(n => n + 1);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);

    return {
        state,
        percent,
        check: () => {
            // A finished download can't be re-checked into a new one.
            if (state === "downloading" || state === "ready") return;
            set("checking");
            window.electron.checkForUpdates();
        },
        install: () => window.electron.quitAndInstall(),
    };
}
