import {LinkShortcutType} from "@/interfaces/links.ts";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Dialog, DialogContent} from "@/components/ui/dialog.tsx";
import {useEffect, useState} from "react";

interface Props {
    editLink: LinkShortcutType | null,
    setEditLink: (link: LinkShortcutType | null) => void,
    linkShortcuts: LinkShortcutType[],
    setLinkShortcuts: (shortcuts: LinkShortcutType[]) => void,
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

    const onEdit = async () => {
        const existing = linkShortcuts.find(link => link.shortcut === editLink?.shortcut);
        if (!existing) {
            setError("Shortcut not found");
            return false;
        }

        if (editName === "" || editShortcut === "") {
            setError("Please fill all fields");
            return false;
        }

        const updatedShortcuts = linkShortcuts.map(link =>
            link.shortcut === editLink?.shortcut ? { ...link, name: editName, shortcut: editShortcut } : link
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
            open={editLink !== null}
            onOpenChange={() => setEditLink(null)}
        >
            <DialogContent
                style={{ background: "rgba(24, 24, 27,1)" }}
            >
                <Label style={{ display: "flex", alignSelf: 'center' }}>Edit Shortcut</Label>
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
                <Button onClick={handleSave}>
                    Save
                </Button>
            </DialogContent>
        </Dialog>
    )
}
