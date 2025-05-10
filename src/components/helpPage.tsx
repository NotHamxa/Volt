import {Dialog, DialogContent} from "@/components/ui/dialog.tsx";
import React, {useEffect, useRef, useState} from "react";
import {Label} from "@/components/ui/label.tsx";
import {Button} from "@/components/ui/button.tsx";

interface IHelpPage {
    helpModalOpen: boolean;
    setHelpModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}


export default function HelpPage({helpModalOpen,setHelpModalOpen}:IHelpPage) {

    const [listeningToKeyboard,setListeningToKeyboard]=useState<boolean>(false)
    const [openBind,setOpenBind]=useState<string>("")
    const pressedKeysRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const formatKey = (key: string) => {
            if (key.length === 1) return key.toUpperCase();
            return key[0].toUpperCase() + key.slice(1);
        };
        const keyDownHandler = (e: KeyboardEvent) => {
            e.preventDefault();
            pressedKeysRef.current.add(formatKey(e.key));
            setOpenBind(Array.from(pressedKeysRef.current).slice(0, 3).join(" + "));
        };

        const keyUpHandler = (e: KeyboardEvent) => {
            e.preventDefault();
            pressedKeysRef.current.delete(formatKey(e.key));

            setOpenBind(Array.from(pressedKeysRef.current).slice(0, 3).join(" + "));
        };
        if (listeningToKeyboard) {
            window.addEventListener("keydown", keyDownHandler);
            window.addEventListener("keyup", keyUpHandler);
        } else {
            window.removeEventListener("keydown", keyDownHandler);
            window.removeEventListener("keyup", keyUpHandler);
        }

        return () => {
            window.removeEventListener("keydown", keyDownHandler);
            window.removeEventListener("keyup", keyUpHandler);
        };
    }, [listeningToKeyboard]);

    return (
        <Dialog open={helpModalOpen} onOpenChange={setHelpModalOpen}>
            <DialogContent
                className="bg-[#18181b] text-white p-6 rounded-lg focus:outline-none w-[1000px] h-[400px] flex flex-col items-start gap-6"
            >
                <h2 className="text-2xl font-bold self-center">App Settings</h2>

                <div className="flex items-center gap-4">
                    <Label className="text-lg">Open Bind</Label>
                    <Button
                        className="px-3 py-1 text-sm"
                        onClick={() => setListeningToKeyboard(prev => !prev)}
                    >
                        {listeningToKeyboard ? "Stop Listening" : "Edit"}
                    </Button>
                    <span className="text-sm text-gray-400">{openBind}</span>
                </div>
            </DialogContent>
        </Dialog>
    )
}
