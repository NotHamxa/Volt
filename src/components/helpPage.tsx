import {Dialog, DialogContent} from "@/components/ui/dialog.tsx";
import React, {useEffect, useRef, useState} from "react";
import {Label} from "@/components/ui/label.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Check, X} from "lucide-react";
import {showToast} from "@/components/toast.tsx";
import {BarLoader} from "react-spinners";
interface IHelpPage {
    helpModalOpen: boolean;
    setHelpModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}
function DeleteHistorySection() {
    const [open, setOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside)
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [open])
    const handleDelete = async () => {
        window.electronStore.set("searchHistory", "[]")
        showToast("Search history deleted", "Your search history has been removed successfully.")
        setOpen(false)
    }
    return (
        <div className="relative flex items-center gap-4">
            <Label className="text-lg">Delete search history</Label>

            <Button
                className="
                    px-4 py-1 text-sm font-medium text-red-600 border border-red-600 rounded
                    bg-transparent
                    hover:bg-red-600/10 hover:text-red-600
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500
                    transition-colors
                    "
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="true"
            >
                Delete
            </Button>
            <div
                ref={dropdownRef}
                className={`absolute top-full left-0 mt-2 w-80 rounded-md border border-gray-700 bg-[#18181b] shadow-lg p-4 transition-all duration-200 ease-in-out
                ${open ? "opacity-100 visible translate-y-0 z-50" : "opacity-0 invisible -translate-y-2 z-10"}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-delete-title"
            >
                <p id="confirm-delete-title" className="mb-3 font-semibold text-gray-100">
                    Are you sure you want to delete your search history?
                </p>
                <p className="mb-4 text-sm text-gray-400">
                    This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="
                            px-4 py-1 text-sm font-medium text-red-600 border border-red-600 rounded
                            bg-transparent
                            hover:bg-red-600/10 hover:text-red-600
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500
                            transition-colors
                        "
                        size="sm"
                        onClick={handleDelete}
                    >
                        Confirm
                    </Button>
                </div>
            </div>
        </div>
    )
}

function ResetAppData() {
    const [open, setOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside)
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [open])

    const handleReset = async () => {
        window.electronStore.clear()
        showToast("App data reset", "All app data has been reset successfully.")
        setOpen(false)
    }

    return (
        <div className="relative flex items-center gap-4">
            <Label className="text-lg">Reset app data</Label>

            <Button
                className="
                  px-4 py-1 text-sm font-medium text-red-600 border border-red-600 rounded
                  bg-transparent
                  hover:bg-red-600/10 hover:text-red-600
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500
                  transition-colors
                  "
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="true"
            >
                Reset
            </Button>
            <div
                ref={dropdownRef}
                className={`absolute top-full left-0 mt-2 w-80 rounded-md border border-gray-700 bg-[#18181b] shadow-lg p-4 transition-all duration-200 ease-in-out
                ${open ? "opacity-100 visible translate-y-0 z-50" : "opacity-0 invisible -translate-y-2 z-10"}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-delete-title"
            >
                <p id="confirm-reset-title" className="mb-3 font-semibold text-gray-100">
                    Are you sure you want to reset all app data?
                </p>
                <p className="mb-4 text-sm text-gray-400">
                    This action will clear all stored data and cannot be undone.
                    The app will restart after clearing all data.
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="
                          px-4 py-1 text-sm font-medium text-red-600 border border-red-600 rounded
                          bg-transparent
                          hover:bg-red-600/10 hover:text-red-600
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500
                          transition-colors
                        "
                        size="sm"
                        onClick={handleReset}
                    >
                        Confirm
                    </Button>
                </div>
            </div>
        </div>
    )
}


export default function HelpPage({helpModalOpen,setHelpModalOpen}:IHelpPage) {
    const [listeningToKeyboard,setListeningToKeyboard]=useState<boolean>(false)
    const [openBind,setOpenBind]=useState<string>("")
    const [bindLoad,setBindLoad] = useState<boolean>(false)
    const [currentOpenBind,setCurrentOpenBind]=useState<string>("")
    const pressedKeysRef = useRef<Set<string>>(new Set());
    const onLoad = async ()=>{
        setCurrentOpenBind(await window.electronStore.get("openWindowBind"))
    }
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
        pressedKeysRef.current.clear()
        if (!helpModalOpen){
            console.log("event handler removed ")
            window.removeEventListener("keydown",keyDownHandler);
            pressedKeysRef.current.clear()
            setOpenBind("")
            setListeningToKeyboard(false);
        }
    }, [helpModalOpen]);
    useEffect(() => {
        if (listeningToKeyboard) {
            window.addEventListener("keydown", keyDownHandler);
        } else {
            window.removeEventListener("keydown", keyDownHandler);
            pressedKeysRef.current.clear()
            setOpenBind("")
        }

        return () => {
            window.removeEventListener("keydown", keyDownHandler);
        };
    }, [listeningToKeyboard]);

    const confirmChangeBind = async ()=>{
        if (openBind.split("+").length ===1){
            showToast("Warning", "A shortcut should include at least two keys.");
        }
        else{
            const formattedKeys = Array.from(pressedKeysRef.current)
                .slice(0, 3)
                .join("+");
            setBindLoad(true)
            await window.electron.setOpenBind(formattedKeys);
            setBindLoad(false)
            showToast("Success", "Shortcut has been set successfully.");
            setCurrentOpenBind(openBind)
            setOpenBind("")
            setListeningToKeyboard(false)
            window.removeEventListener("keydown", keyDownHandler);
            pressedKeysRef.current.clear()
        }
    }

    return (
        <Dialog open={helpModalOpen} onOpenChange={setHelpModalOpen}>
            <DialogContent
                className="bg-[#18181b] text-white p-6 rounded-lg focus:outline-none w-[1000px] h-[400px] flex flex-col items-start gap-6"
            >
                <h2 className="text-2xl font-bold self-center">App Settings</h2>

                <div className="flex items-center gap-4">
                    <Label className="text-lg">Open Bind</Label>
                    {listeningToKeyboard && <Button
                        className="px-3 py-1 text-sm"
                        onClick={() => setListeningToKeyboard(false)}
                    >
                        <X size={24}/>
                    </Button>}
                    <Button
                        className="px-3 py-1 text-sm"
                        onClick={async () => {
                            if (listeningToKeyboard)
                                await confirmChangeBind()
                            else
                                setListeningToKeyboard(prev => !prev)
                        }}
                    >
                        {listeningToKeyboard ? (
                            bindLoad ? (
                                <BarLoader/>
                            ) : (
                                <Check size={24} />
                            )
                        ) : (
                            "Edit"
                        )}
                    </Button>
                    <span className="text-sm text-gray-400">{listeningToKeyboard ? openBind:currentOpenBind}</span>
                </div>
                <DeleteHistorySection/>
                <ResetAppData/>
            </DialogContent>
        </Dialog>
    )
}
