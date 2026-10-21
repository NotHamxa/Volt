import { useCallback, useEffect, useState } from "react";
import { Globe, X } from "lucide-react";
import { SectionLead } from "@/components/settingsLayout.tsx";
import { HotkeyRow, SaveResult } from "@/components/hotkeyRow.tsx";
import { useLaunchHotkeys } from "@/hooks/useLaunchHotkeys.ts";
import { LinkShortcutType } from "@/interfaces/links.ts";
import { cachedFavicon, linkFavicon } from "@/utils/linkFavicons.ts";

function Favicon({ url }: { url: string }) {
    const [icon, setIcon] = useState<string | null>(() => cachedFavicon(url) ?? null);
    useEffect(() => {
        let cancelled = false;
        linkFavicon(url).then(i => { if (!cancelled) setIcon(i); });
        return () => { cancelled = true; };
    }, [url]);
    return icon
        ? <img src={icon} alt="" className="w-5 h-5 shrink-0 object-contain" />
        : <Globe size={18} strokeWidth={1.6} className="shrink-0 text-tone-300" />;
}

async function readLinks(): Promise<LinkShortcutType[]> {
    try {
        const parsed = JSON.parse(await window.electronStore.get("linkShortcuts") ?? "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export default function LinksSection({ onRecordingChange }: { onRecordingChange?: (v: boolean) => void }) {
    const [links, setLinks] = useState<LinkShortcutType[] | null>(null);
    const [recordingId, setRecordingId] = useState<string | null>(null);
    const stopRecording = useCallback(() => setRecordingId(null), []);
    const { list, save, clear } = useLaunchHotkeys();

    const load = useCallback(() => { readLinks().then(setLinks); }, []);

    useEffect(() => {
        load();
        window.addEventListener("reloadShortcuts", load);
        return () => window.removeEventListener("reloadShortcuts", load);
    }, [load]);

    useEffect(() => {
        onRecordingChange?.(recordingId !== null);
    }, [recordingId, onRecordingChange]);

    // The hotkey is saved onto the link itself, so the list is re-read and the
    // home view told to do the same.
    const afterChange = (result: SaveResult) => {
        window.dispatchEvent(new Event("reloadShortcuts"));
        return result;
    };

    return (
        <div className="space-y-6">
            <SectionLead>
                While Volt is open, Ctrl + 1–9 open your first nine links. Give
                one a hotkey and it opens from anywhere in Windows instead.
            </SectionLead>

            {links === null ? null : links.length === 0 ? (
                <p className="text-11.5 text-tone-300 leading-relaxed">
                    No pinned links yet. Add them with the Add button under Links on the home view.
                </p>
            ) : (
                <div className="space-y-2" data-setting="link-hotkeys">
                    {links.map((link, i) => {
                        const hotkey = list.find(h => h.kind === "link" && h.id === link.shortcut);
                        const target = { kind: "link" as const, url: link.shortcut };
                        return (
                            <HotkeyRow
                                key={link.shortcut}
                                icon={<Favicon url={link.shortcut} />}
                                title={link.name}
                                description={i < 8 ? <><span className="font-mono">Ctrl+{i + 1}</span> · {link.shortcut}</> : link.shortcut}
                                note={hotkey && !hotkey.active ? "Another program has this combination, so it isn't working right now." : null}
                                current={link.hotkey ?? ""}
                                recording={recordingId === link.shortcut}
                                onRecord={() => setRecordingId(link.shortcut)}
                                onStop={stopRecording}
                                onSave={async combo => afterChange(await save(target, combo))}
                                action={link.hotkey
                                    ? { icon: <X size={12} />, title: "Remove hotkey", run: async () => afterChange(await clear(target)) }
                                    : null}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
