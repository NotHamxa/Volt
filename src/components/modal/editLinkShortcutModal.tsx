import {useCallback, useEffect, useState} from "react";
import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Button} from "@/components/ui/button.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";
import {useEscape} from "@/hooks/useEscape.ts";


interface Props {
    open: boolean;
    setOpen: (open: boolean) => void;
    editLink: LinkShortcutType | null;
    linkShortcuts: LinkShortcutType[];
}
export default function EditLinkShortcutModal({
                                                  open,
                                                  editLink,
                                                  setOpen,
                                                  linkShortcuts,
                                              }: Props) {
    const [editName, setEditName] = useState("");
    const [editShortcut, setEditShortcut] = useState("");
    const [error, setError] = useState("");

    const closeModal = useCallback(() => {
        setError("");
        setOpen(false);
    }, [setOpen]);

    useEscape(closeModal, open);

    const onEdit = async (): Promise<boolean> => {
        const existing = linkShortcuts.find(
            (link) => link.shortcut === editLink?.shortcut
        );

        if (!existing) {
            setError("Shortcut not found");
            return false;
        }

        if (editName.trim() === "" || editShortcut.trim() === "") {
            setError("Please fill all fields");
            return false;
        }

        let normalizedShortcut = editShortcut.trim();
        if (!/^https?:\/\//i.test(normalizedShortcut)) {
            normalizedShortcut = `https://${normalizedShortcut}`;
        }

        try {
            new URL(normalizedShortcut);
        } catch {
            setError("Invalid link. Please enter a valid URL.");
            return false;
        }

        // Links are keyed by URL, React keys, drag ids, and Remove all use it,
        // so a second link to the same place would be one link twice.
        if (linkShortcuts.some(link => link.shortcut === normalizedShortcut && link.shortcut !== editLink?.shortcut)) {
            setError("Link already exists");
            return false;
        }

        const updatedShortcuts = linkShortcuts.map((link) =>
            link.shortcut === editLink?.shortcut
                ? { ...link, name: editName.trim(), shortcut: normalizedShortcut }
                : link
        );

        window.electronStore.set(
            "linkShortcuts",
            JSON.stringify(updatedShortcuts)
        );
        window.dispatchEvent(new Event("reloadShortcuts"));

        return true;
    };

    // On every open, not only when a different link is picked: reopening the
    // same one after Cancel would otherwise show the text you discarded.
    useEffect(() => {
        if (open && editLink) {
            setEditName(editLink.name);
            setEditShortcut(editLink.shortcut);
            setError("");
        }
    }, [open, editLink]);

    const handleSave = async () => {
        const success = await onEdit();
        if (success) {
            setOpen(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="bg-surface">
                <DialogTitle>
                    <Label className="flex self-center">
                        Edit Shortcut
                    </Label>
                </DialogTitle>

                <Label>Name</Label>
                <Input
                    value={editName}
                    onChange={(e) => {
                        setEditName(e.target.value);
                        setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />

                <Label>Link</Label>
                <Input
                    value={editShortcut}
                    onChange={(e) => {
                        setEditShortcut(e.target.value);
                        setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />

                {error && (
                    <p className="text-red-500 text-sm">{error}</p>
                )}

                <Button onClick={handleSave}>Save</Button>
            </DialogContent>
        </Dialog>
    );
}
