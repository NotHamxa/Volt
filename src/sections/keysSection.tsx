import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { SectionLead, GroupLabel } from "@/components/settingsLayout.tsx";
import { BINDINGS, Binding, BindingGroup, comboParts, expandCombo, normalizeCombo, toAccelerator } from "@/data/keybindings.ts";
import { useKeybindings, conflictWith, comboProblem } from "@/hooks/useKeybindings.ts";
import { useLaunchHotkeys } from "@/hooks/useLaunchHotkeys.ts";
import { HotkeyRow, SaveResult } from "@/components/hotkeyRow.tsx";

const GROUP_ORDER: BindingGroup[] = ["Global", "Navigation", "Results", "AI", "Settings"];

const GROUP_HINT: Record<BindingGroup, string> = {
    Global: "Works anywhere in Windows, even when Volt is closed",
    Navigation: "Moving around Volt",
    Results: "Driving the result list",
    AI: "In the chat view",
    Settings: "In here",
};

export default function KeysSection({ onRecordingChange }: { onRecordingChange?: (v: boolean) => void }) {
    const { get, set, reset } = useKeybindings();
    // App and link hotkeys are global, so they'd swallow any of these too.
    const { ownerOf: launchOwner } = useLaunchHotkeys();
    // null until the store answers; the row shows the default meanwhile.
    const [globalCombo, setGlobalCombo] = useState<string | null>(null);
    const [recordingId, setRecordingId] = useState<string | null>(null);
    // Stable: the recorder lists it as an effect dependency.
    const stopRecording = useCallback(() => setRecordingId(null), []);

    const readGlobalCombo = () =>
        window.electronStore.get("openWindowBind")
            .then(v => setGlobalCombo(v ? normalizeCombo(v) : ""))
            .catch(() => { /* keep what's shown */ });

    useEffect(() => {
        window.electronStore.get("openWindowBind")
            .then(v => setGlobalCombo(v ? normalizeCombo(v) : ""))
            .catch(() => { /* the default stays shown */ });
    }, []);

    // A half-recorded shortcut is the one unsaved edit in settings, so the
    // shell's discard-changes guard follows it here.
    useEffect(() => {
        onRecordingChange?.(recordingId !== null);
    }, [recordingId, onRecordingChange]);

    const globalLabel = BINDINGS.find(b => b.global)?.label ?? "Open Volt";

    /**
     * Hands the combo to the main process, which registers the new hotkey
     * before letting the old one go and answers false when Windows refuses it.
     * Either way the old binding is re-read, so the row shows what's live.
     */
    const registerGlobal = async (combo: string): Promise<SaveResult> => {
        const accelerator = toAccelerator(combo);
        if (!accelerator) return { message: "Windows can't use that key for a global shortcut." };
        let ok = false;
        try {
            ok = await window.electron.setOpenBind(accelerator);
        } catch { /* treated as a refusal */ }
        if (!ok) {
            await readGlobalCombo();
            return { message: "Windows wouldn't grant that combination. Something else is using it.", revert: true };
        }
        setGlobalCombo(accelerator);
        return null;
    };

    const save = async (b: Binding, combo: string): Promise<SaveResult> => {
        // Registered with the OS, which refuses single keys and anything
        // another application already owns.
        if (b.global && comboParts(combo).length < 2) return { message: "Use at least two keys, e.g. Ctrl + Space." };
        const problem = comboProblem(combo);
        if (problem) return { message: problem };
        const opens = launchOwner(toAccelerator(combo) ?? combo);
        if (opens) return { message: `Already opens "${opens}" from anywhere.` };
        if (b.global) {
            // Windows hands a registered hotkey to Volt even while Volt is
            // focused, so it would also swallow the in-app binding.
            const clash = conflictWith(b.id, combo);
            if (clash) return { message: `Already used by "${clash}".` };
            return registerGlobal(combo);
        }
        const clash = conflictWith(b.id, combo) ?? (combo === globalCombo ? globalLabel : null);
        if (clash) return { message: `Already used by "${clash}".` };
        set(b.id, combo);
        return null;
    };

    const resetTo = async (b: Binding): Promise<SaveResult> => {
        if (b.global) return registerGlobal(b.default);
        // The default may have been handed to another command since.
        const clash = expandCombo(b.default).map(c => conflictWith(b.id, c)).find(Boolean);
        if (clash) return { message: `Its default is now used by "${clash}".` };
        reset(b.id);
        return null;
    };

    return (
        <div className="space-y-7">
            <SectionLead>
                Every shortcut Volt responds to. The ones without a Change button are
                structural: remapping Enter or Escape would leave no way to accept or
                back out of anything.
            </SectionLead>

            {GROUP_ORDER.map(group => {
                const members = BINDINGS.filter(b => b.group === group);
                if (members.length === 0) return null;
                return (
                    <div key={group} className="space-y-2">
                        <div className="flex items-baseline gap-2">
                            <GroupLabel>{group}</GroupLabel>
                            <span className="text-10 text-tone-250">{GROUP_HINT[group]}</span>
                        </div>
                        {members.map(b => {
                            const current = b.global ? (globalCombo ?? b.default) : get(b.id);
                            return (
                                <HotkeyRow
                                    key={b.id}
                                    anchor={b.id}
                                    title={b.label}
                                    description={b.description}
                                    current={current}
                                    editable={b.editable}
                                    recording={recordingId === b.id}
                                    onRecord={() => setRecordingId(b.id)}
                                    onStop={stopRecording}
                                    onSave={combo => save(b, combo)}
                                    action={normalizeCombo(current) !== b.default
                                        ? { icon: <RotateCcw size={11} />, title: `Reset to ${b.default}`, run: () => resetTo(b) }
                                        : null}
                                />
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
