import { useEffect, useState } from "react";

export type UpdateState = "idle" | "checking" | "downloading" | "ready" | "uptodate" | "error";

export type UpdateStatus = {
    state: UpdateState;
    percent: number;
    /** Why the last check or download failed; set only in the "error" state. */
    error: string | null;
    check: () => void;
    install: () => void;
};

/**
 * Update state, shared.
 *
 * Every place that shows update progress reads this one copy, subscribed once
 * at module scope, so the chip in the settings header, About and the footer
 * can't disagree, and remounting any of them doesn't add another listener.
 */
let state: UpdateState = "idle";
let percent = 0;
let error: string | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

function set(next: UpdateState, pct = percent) {
    state = next;
    percent = pct;
    if (next !== "error") error = null;
    emit();
}

function fail(message: string) {
    // electron-updater's messages can carry a whole HTTP response; the first
    // line says what went wrong.
    const line = (message || "").split("\n")[0].trim();
    error = !line ? "Couldn't check for updates." : line.length > 140 ? `${line.slice(0, 139)}…` : line;
    set("error");
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
    window.electron.onUpdateError(({ message }) => {
        // The launch-time check fails quietly when offline; only a check or
        // download someone can see needs to say it stopped.
        if (state === "checking" || state === "downloading") fail(message);
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
        error,
        check: () => {
            // A finished download can't be re-checked into a new one.
            if (state === "downloading" || state === "ready" || state === "checking") return;
            set("checking");
            window.electron.checkForUpdates()
                .then(result => {
                    // No check began, so no event is coming to move this on.
                    if (!result?.ok && state === "checking") fail(result?.message ?? "");
                })
                .catch(err => { if (state === "checking") fail(err?.message ?? ""); });
        },
        install: () => window.electron.quitAndInstall(),
    };
}
