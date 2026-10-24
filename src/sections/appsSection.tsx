import { useCallback, useEffect, useMemo, useState } from "react";
import { AppWindowIcon, Search, X } from "lucide-react";
import { SectionLead, GroupLabel } from "@/components/settingsLayout.tsx";
import { HotkeyRow } from "@/components/hotkeyRow.tsx";
import { useLaunchHotkeys } from "@/hooks/useLaunchHotkeys.ts";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import { appKey } from "@/utils/appUtils.ts";
import { appLogo } from "@/utils/appLogos.ts";

const SOURCE_LABEL: Record<string, string> = { UWP: "Store app", Steam: "Steam game" };

function AppLogo({ app }: { app: SearchQueryT }) {
    const [logo, setLogo] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        // Batched with every other row mounting this tick, one IPC call.
        appLogo(app).then(l => { if (!cancelled) setLogo(l); });
        return () => { cancelled = true; };
    }, [app]);
    return logo
        ? <img src={logo} alt="" className="w-5 h-5 shrink-0 object-contain" />
        : <AppWindowIcon size={18} strokeWidth={1.6} className="shrink-0 text-tone-300" />;
}

export default function AppsSection({ onRecordingChange }: { onRecordingChange?: (v: boolean) => void }) {
    const [apps, setApps] = useState<SearchQueryT[] | null>(null);
    const [q, setQ] = useState("");
    const [recordingId, setRecordingId] = useState<string | null>(null);
    const stopRecording = useCallback(() => setRecordingId(null), []);
    const { list, save, clear } = useLaunchHotkeys();

    useEffect(() => {
        const load = () => window.apps.searchApps("").then(setApps).catch(() => setApps([]));
        load();
        // The catalog lands after startup, and again when an install changes it.
        const offLoaded = window.electron.onCacheLoaded(load);
        const offReload = window.electron.onCacheReload(load);
        return () => { offLoaded(); offReload(); };
    }, []);

    useEffect(() => {
        onRecordingChange?.(recordingId !== null);
    }, [recordingId, onRecordingChange]);

    const hotkeys = useMemo(() => new Map(list.filter(h => h.kind === "app").map(h => [h.id, h])), [list]);

    // Assigned apps first, including ones since uninstalled, their hotkey
    // still holds the combination until it's cleared.
    const { assigned, rest } = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const matches = (app: SearchQueryT) => !needle || app.name.toLowerCase().includes(needle);
        const installed = apps ?? [];
        const seen = new Set(installed.map(appKey));
        const missing = [...hotkeys.values()]
            .filter(h => h.app && !seen.has(h.id))
            .map(h => h.app!);
        const byName = (a: SearchQueryT, b: SearchQueryT) => a.name.localeCompare(b.name);
        return {
            assigned: [...installed.filter(a => hotkeys.has(appKey(a))), ...missing].filter(matches).sort(byName),
            rest: installed.filter(a => !hotkeys.has(appKey(a))).filter(matches),
        };
    }, [apps, hotkeys, q]);

    const installedKeys = useMemo(() => new Set((apps ?? []).map(appKey)), [apps]);

    const row = (app: SearchQueryT) => {
        const id = appKey(app);
        const hotkey = hotkeys.get(id);
        // An empty catalog means it hasn't loaded yet, not that everything is gone.
        const gone = installedKeys.size > 0 && !installedKeys.has(id);
        const note = gone
            ? "This app isn't installed any more."
            : hotkey && !hotkey.active ? "Another program has this combination, so it isn't working right now." : null;
        return (
            <HotkeyRow
                key={id}
                icon={<AppLogo app={app} />}
                title={app.name}
                description={app.source ? SOURCE_LABEL[app.source] : undefined}
                note={note}
                current={hotkey?.combo ?? ""}
                recording={recordingId === id}
                onRecord={() => setRecordingId(id)}
                onStop={stopRecording}
                onSave={combo => save({ kind: "app", app }, combo)}
                action={hotkey
                    ? { icon: <X size={12} />, title: "Remove hotkey", run: () => clear({ kind: "app", app }) }
                    : null}
            />
        );
    };

    return (
        <div className="space-y-6">
            <SectionLead>
                Give an app a hotkey and it opens from anywhere in Windows, and Volt
                doesn't need to be showing. Use a combination other programs
                don't, like Ctrl + Alt + a letter.
            </SectionLead>

            <div className="relative" data-setting="app-hotkeys">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-tone-250 pointer-events-none" />
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Filter apps"
                    aria-label="Filter apps"
                    className="w-full h-8 pl-8 pr-3 rounded-lg bg-fill-040 text-12 text-tone-800 placeholder:text-tone-250 outline-none focus:bg-fill-060 transition-colors"
                />
            </div>

            {apps === null ? (
                <p className="text-11.5 text-tone-300">Loading apps…</p>
            ) : (
                <>
                    {assigned.length > 0 && (
                        <div className="space-y-2">
                            <GroupLabel>With a hotkey</GroupLabel>
                            {assigned.map(row)}
                        </div>
                    )}
                    <div className="space-y-2">
                        <GroupLabel>{assigned.length > 0 ? "Other apps" : "All apps"}</GroupLabel>
                        {rest.length > 0
                            ? rest.map(row)
                            : <p className="text-11.5 text-tone-300">
                                {q.trim() ? `No apps match “${q.trim()}”.` : "No apps found yet. They appear once Volt finishes loading them."}
                              </p>}
                    </div>
                </>
            )}
        </div>
    );
}
