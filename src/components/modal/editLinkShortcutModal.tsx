import {useEffect, useState} from "react";
import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Button} from "@/components/ui/button.tsx";
import {LinkShortcutType} from "@/interfaces/links.ts";


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

    useEffect(() => {
        if (editLink) {
            setEditName(editLink.name);
            setEditShortcut(editLink.shortcut);
            setError("");
        }
    }, [editLink]);

    const handleSave = async () => {
        const success = await onEdit();
        if (success) {
            setOpen(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent style={{ background: "rgba(24, 24, 27, 1)" }}>
                <DialogTitle>
                    <Label style={{ display: "flex", alignSelf: "center" }}>
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
                    <p style={{ color: "red", fontSize: "0.875rem" }}>{error}</p>
                )}

                <Button onClick={handleSave}>Save</Button>
            </DialogContent>
        </Dialog>
    );
}
