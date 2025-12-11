import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import React, { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Check, X, Plus } from "lucide-react";
import { showToast } from "@/components/toast.tsx";
import { BarLoader } from "react-spinners";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import allBangs from "@/data/bangs.json";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";

interface IHelpPage {
    helpModalOpen: boolean;
    setHelpModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

type BangType =
    | {
    c: string;
    sc: string;
    d: string;
    r: number;
    s: string;
    t: string;
    u: string;
}
    | {
    d: string;
    r: number;
    s: string;
    t: string;
    u: string;
    c?: undefined;
    sc?: undefined;
};

function DeleteHistorySection() {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            window.electronStore.set("searchHistory", "[]");
            showToast("Search history deleted","Your search history has been removed successfully.")

        } catch {
            showToast("Error","Failed to delete search history.")
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline">Delete</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 p-4">
                <DropdownMenuLabel className="mb-2">
                    Are you sure you want to delete your search history?
                </DropdownMenuLabel>
                <DropdownMenuLabel className="text-sm text-muted-foreground mb-4">
                    This action cannot be undone.
                </DropdownMenuLabel>

                <div className="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => console.log("Cancel clicked")}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting ? "Deleting..." : "Confirm"}
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
export function ResetAppData() {
    const [isResetting, setIsResetting] = useState(false);

    const handleReset = async () => {
        setIsResetting(true);
        try {
            window.electronStore.clear();
            showToast("App data reset", "All app data has been reset successfully.");
        } catch{
            showToast("Error","Failed to delete app data.")

        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="flex items-center gap-4">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline">Reset</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80 p-4">
                    <DropdownMenuLabel className="mb-2 font-semibold text-gray-100">
                        Are you sure you want to reset all app data?
                    </DropdownMenuLabel>
                    <p className="mb-4 text-sm text-gray-400">
                        This action will clear all stored data and cannot be undone. The app will restart after clearing all data.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm">
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleReset}
                            disabled={isResetting}
                        >
                            {isResetting ? "Resetting..." : "Confirm"}
                        </Button>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}


export default function HelpPage({ helpModalOpen, setHelpModalOpen }: IHelpPage) {
    const [listeningToKeyboard, setListeningToKeyboard] = useState<boolean>(false);
    const [openBind, setOpenBind] = useState<string>("");
    const [bindLoad, setBindLoad] = useState<boolean>(false);
    const [currentOpenBind, setCurrentOpenBind] = useState<string>("");
    const pressedKeysRef = useRef<Set<string>>(new Set());

    const [bangSearch, setBangSearch] = useState<string>("");
    const [bangs, setBangs] = useState<BangType[] | null>(null);

    const [cachedFolders,setCachedFolders] = useState<string[]>([]);

    const onLoad = async () => {
        setCurrentOpenBind(await window.electronStore.get("openWindowBind"));
    };
    const formatKey = (code: string, key: string): string => {
        const keyMap: Record<string, string> = {
            ControlLeft: "Ctrl",
            ControlRight: "Ctrl",
            ShiftLeft: "Shift",
            ShiftRight: "Shift",
            AltLeft: "Alt",
            AltRight: "Alt",
            MetaLeft: "Super",
            MetaRight: "Super",
            Space: "Space",
            Escape: "Escape",
            ArrowUp: "Up",
            ArrowDown: "Down",
            ArrowLeft: "Left",
            ArrowRight: "Right",
        };
        return keyMap[code] || key.toUpperCase();
    };

    const keyDownHandler = (e: KeyboardEvent) => {
        e.preventDefault();
        const formattedKey = formatKey(e.code, e.key);
        if (formattedKey === "+") return;
        pressedKeysRef.current.add(formattedKey);
        setOpenBind(Array.from(pressedKeysRef.current).slice(0, 3).join(" + "));
    };

    useEffect(() => {
        onLoad();
        pressedKeysRef.current.clear();
        if (!helpModalOpen) {
            window.removeEventListener("keydown", keyDownHandler);
            pressedKeysRef.current.clear();
            setOpenBind("");
            setListeningToKeyboard(false);
        }
        setCachedFolders([])
    }, [helpModalOpen]);

    useEffect(() => {
        if (listeningToKeyboard) {
            window.addEventListener("keydown", keyDownHandler);
        } else {
            window.removeEventListener("keydown", keyDownHandler);
            pressedKeysRef.current.clear();
            setOpenBind("");
        }

        return () => {
            window.removeEventListener("keydown", keyDownHandler);
        };
    }, [listeningToKeyboard]);

    const confirmChangeBind = async () => {
        if (openBind.split("+").length === 1) {
            showToast("Warning", "A shortcut should include at least two keys.");
        } else {
            const formattedKeys = Array.from(pressedKeysRef.current).slice(0, 3).join("+");
            setBindLoad(true);
            await window.electron.setOpenBind(formattedKeys);
            setBindLoad(false);
            showToast("Success", "Shortcut has been set successfully.");
            setCurrentOpenBind(openBind);
            setOpenBind("");
            setListeningToKeyboard(false);
            window.removeEventListener("keydown", keyDownHandler);
            pressedKeysRef.current.clear();
        }
    };
    const onAddFolder = async ()=>{
        const folder = await window.electron.selectFolder();
        console.log(folder);
        if (folder) {
            setCachedFolders([...cachedFolders, folder]);
        }
    }

    return (
        <Dialog open={helpModalOpen} onOpenChange={setHelpModalOpen}>
            <DialogContent className="bg-[#18181b] text-white p-6 rounded-lg focus:outline-none w-[1000px] h-[400px] flex flex-col items-start gap-6">
                <Tabs className="w-full">
                    <div className="w-full flex justify-center">
                        <TabsList className="flex gap-2">
                            <TabsTrigger value="settings">Settings</TabsTrigger>
                            <TabsTrigger value="bangs">Bangs</TabsTrigger>
                            <TabsTrigger value={"folders"}>Folders</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="settings">
                        <ScrollArea className="h-[60vh] w-full rounded-lg bg-[#18181b] p-4">
                            <div className={"space-y-6"}>
                                <div className="bg-[#1f1f23] p-4 rounded-lg shadow-sm flex flex-col gap-3">
                                    <Label className="text-lg font-semibold">Open Bind</Label>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        {listeningToKeyboard && (
                                            <Button variant="outline" onClick={() => setListeningToKeyboard(false)}>
                                                <X size={20} />
                                            </Button>
                                        )}
                                        <Button
                                            variant="secondary"
                                            className="px-3 py-1 text-sm"
                                            onClick={async () => {
                                                if (listeningToKeyboard) await confirmChangeBind();
                                                else setListeningToKeyboard((prev) => !prev);
                                            }}
                                        >
                                            {listeningToKeyboard ? (bindLoad ? <BarLoader width={50} /> : <Check size={20} />) : "Edit"}
                                        </Button>
                                        <span className="text-sm text-gray-400 font-mono">
                                  {listeningToKeyboard ? openBind : currentOpenBind || "No bind set"}
                                </span>
                                    </div>
                                </div>

                                <div className="bg-[#1f1f23] p-4 rounded-lg shadow-sm flex flex-col gap-3">
                                    <Label className="text-lg font-semibold">Search History</Label>
                                    <DeleteHistorySection />
                                </div>

                                <div className="bg-[#1f1f23] p-4 rounded-lg shadow-sm flex flex-col gap-3">
                                    <Label className="text-lg font-semibold">App Data</Label>
                                    <ResetAppData />
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>



                    <TabsContent value="bangs">
                        <Input
                            value={bangSearch}
                            placeholder={"Search by name"}
                            onChange={(e) => {
                                const query = e.target.value;
                                setBangSearch(query);
                                if (query.trim() === "") {
                                    setBangs(null);
                                } else {
                                    const filtered = allBangs.filter((bang) =>
                                        bang.s.toLowerCase().startsWith(query.toLowerCase().trim())
                                    );
                                    setBangs(filtered);
                                }
                            }}
                        />
                        <ScrollArea className="h-64 rounded-md mt-2">
                            {bangs && bangs.length > 0 ? (
                                <div className="space-y-2">
                                    {bangs.map((bang, index) => (
                                        <div
                                            key={index}
                                            className="rounded-lg bg-muted px-4 py-2 hover:bg-muted/80 transition-colors"
                                        >
                                            <Label className="block text-sm text-gray-500">{bang.s}</Label>
                                            <Label className="block text-xs text-gray-400">
                                                Shortcut: {bang.t}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            ) : bangSearch.trim() !== "" ? (
                                <div className="text-sm text-gray-400 mt-2 px-2">No results found</div>
                            ) : null}
                        </ScrollArea>
                    </TabsContent>
                    <TabsContent value={"folders"}>
                        <Button onClick={onAddFolder}>
                            <Plus size={24}/>
                        </Button>
                        {cachedFolders.map((folder, index) => (
                            <div>
                                <label>{folder}</label>
                                <label>{index}</label>
                            </div>
                        ))}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
