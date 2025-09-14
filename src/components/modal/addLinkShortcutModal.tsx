import {Dialog, DialogContent} from "@/components/ui/dialog.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Button} from "@/components/ui/button.tsx";
import {useState} from "react";
import {LinkShortcutType} from "@/interfaces/links.ts";

interface Props {
    addShortcutOpenModal: boolean;
    setAddShortcutOpenModal: (open: boolean) => void;
    linkShortcuts: LinkShortcutType[],
    setLinkShortcuts: (shortcuts:LinkShortcutType[]) => void;
}

export default function AddLinkShortcutModal({
                                                 addShortcutOpenModal,
                                                 setAddShortcutOpenModal,
                                                 linkShortcuts,
                                                 setLinkShortcuts,
                                             }: Props) {

    const [linkName, setLinkName] = useState<string>("");
    const [linkShortcut, setLinkShortcut] = useState<string>("");
    const [error, setError] = useState<string>("");

    const addLinkShortcut = async () => {
        let normalizedShortcut = linkShortcut.trim();
        if (!/^https?:\/\//i.test(normalizedShortcut)) {
            normalizedShortcut = `https://${normalizedShortcut}`;
        }

        try {
            new URL(normalizedShortcut);
            if (linkShortcuts.find(link => link.shortcut === normalizedShortcut)) {
                setError("Link already exists");
                return false;
            }
            const shortcuts = [...linkShortcuts, { name: linkName, shortcut: normalizedShortcut }];
            setLinkShortcuts(shortcuts);
            window.electronStore.set("linkShortcuts", JSON.stringify(shortcuts));
            return true;
        } catch {
            setError("Invalid link. Please enter a valid URL.");
            return false;
        }
    };

    const handleSave = async () => {
        if (linkName === "" || linkShortcut === "") {
            setError("Please fill all fields");
            return;
        }
        const success = await addLinkShortcut();
        if (success) {
            setLinkName("");
            setLinkShortcut("");
            setError("");
            setAddShortcutOpenModal(false);
        }
    };

    return (
        <Dialog
            open={addShortcutOpenModal}
            onOpenChange={setAddShortcutOpenModal}
        >
            <DialogContent
                style={{ background: "rgba(24, 24, 27,1)" }}
            >
                <Label style={{ display: "flex", alignSelf: 'center' }}>Add Shortcut</Label>
                <Label>Name</Label>
                <Input
                    value={linkName}
                    onChange={(e) => {
                        setLinkName(e.target.value);
                        setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
                <Label>Link</Label>
                <Input
                    value={linkShortcut}
                    onChange={(e) => {
                        setLinkShortcut(e.target.value);
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
