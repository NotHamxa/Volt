import {Dialog, DialogContent} from "@/components/ui/dialog.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Button} from "@/components/ui/button.tsx";
import {useEffect, useState} from "react";
import {LinkShortcutType} from "@/interfaces/links.ts";

interface Props {
    editLink: LinkShortcutType | null;
    setEditLink: (link: LinkShortcutType | null) => void;
    linkShortcuts: LinkShortcutType[];
    setLinkShortcuts: (shortcuts: LinkShortcutType[]) => void;
}

export default function EditLinkShortcutModal({
                                                  editLink,
                                                  setEditLink,
                                                  linkShortcuts,
                                                  setLinkShortcuts
                                              }: Props) {
    const [editName, setEditName] = useState("");
    const [editShortcut, setEditShortcut] = useState("");
    const [error, setError] = useState("");

    const onEdit = async (): Promise<boolean> => {
        const existing = linkShortcuts.find(link => link.shortcut === editLink?.shortcut);
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

        const updatedShortcuts = linkShortcuts.map(link =>
            link.shortcut === editLink?.shortcut
                ? { ...link, name: editName.trim(), shortcut: normalizedShortcut }
                : link
        );
        setLinkShortcuts(updatedShortcuts);
        window.electronStore.set("linkShortcuts", JSON.stringify(updatedShortcuts));
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
            setEditName("");
            setEditShortcut("");
            setError("");
            setEditLink(null);
        }
    };
    return (
        <Dialog
            open={editLink!=null}
            onOpenChange={open => {
                if (!open) {
                    setEditLink(null);
                }
            }}
        >
            <DialogContent
                style={{ background: "rgba(24, 24, 27,1)" }}
            >
                <Label style={{ display: "flex", alignSelf: 'center' }}>Add Shortcut</Label>
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