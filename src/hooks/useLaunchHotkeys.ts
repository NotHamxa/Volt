import { useCallback, useEffect, useState } from "react";
import { hasCommandModifier, toAccelerator } from "@/data/keybindings.ts";
import { conflictWith } from "@/hooks/useKeybindings.ts";
import { LaunchHotkey, LaunchTarget } from "@/interfaces/launchHotkeys.ts";
import { SaveResult } from "@/components/hotkeyRow.tsx";

/**
 * Why a combo can't open an app or link from anywhere, or null. These are
 * registered with Windows, so they're taken from every other program too,
 * and from Volt itself while it has focus.
 */
function launchComboProblem(combo: string): string | null {
    if (!toAccelerator(combo)) return "Windows can't use that key for a global shortcut.";
    if (!hasCommandModifier(combo)) return "Add Ctrl, Alt or Win. A hotkey that works everywhere can't be a bare key.";
    if (/^Ctrl\+[1-9]$/.test(combo)) return "Volt uses Ctrl + 1–9 to open pinned links.";
    const clash = conflictWith("", combo);
    if (clash) return `Volt uses that for "${clash}".`;
    return null;
}

/** App and link hotkeys, read from the main process, which owns them. */
export function useLaunchHotkeys() {
    const [list, setList] = useState<LaunchHotkey[]>([]);

    const refresh = useCallback(async () => {
        try {
            setList(await window.apps.getLaunchHotkeys());
        } catch { /* keep what's shown */ }
    }, []);

    useEffect(() => {
        let active = true;
        window.apps.getLaunchHotkeys()
            .then(l => { if (active) setList(l); })
            .catch(() => { /* nothing assigned is a fine fallback */ });
        return () => { active = false; };
    }, []);

    const save = useCallback(async (target: LaunchTarget, combo: string): Promise<SaveResult> => {
        const problem = launchComboProblem(combo);
        if (problem) return { message: problem };
        let refused: string | null;
        try {
            refused = await window.apps.setLaunchHotkey(target, toAccelerator(combo)!);
        } catch {
            refused = "Couldn't save that hotkey.";
        }
        await refresh();
        return refused ? { message: refused } : null;
    }, [refresh]);

    const clear = useCallback(async (target: LaunchTarget): Promise<SaveResult> => {
        const refused = await window.apps.setLaunchHotkey(target, "");
        await refresh();
        return refused ? { message: refused } : null;
    }, [refresh]);

    /** What a combo already opens from anywhere, if anything. */
    const ownerOf = useCallback((combo: string) => list.find(h => h.combo === combo)?.label ?? null, [list]);

    return { list, refresh, save, clear, ownerOf };
}
