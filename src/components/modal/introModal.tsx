import { Dispatch, SetStateAction, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import logo from "@/assets/icon.png";
import { useEscape } from "@/hooks/useEscape.ts";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface IntroModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    onStartTour: () => void;
}

export function IntroModal({ open, setOpen, onStartTour }: IntroModalProps) {
    const close = useCallback((start: boolean) => {
        window.electronStore.set("showIntroModal", false);
        setOpen(false);
        if (start) {
            // Wait for modal exit animation before starting the tour
            setTimeout(() => onStartTour(), 280);
        }
    }, [setOpen, onStartTour]);

    useEscape(useCallback(() => close(false), [close]), open);

    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Enter") close(true);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, close]);

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.65)] backdrop-blur-[8px]"
            >
                <motion.div
                    initial={{ scale: 0.93, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.93, opacity: 0, y: 16 }}
                    transition={{ duration: 0.38, ease: EASE }}
                    className="relative flex flex-col items-center justify-center w-96 px-10 py-12 gap-6 rounded-2xl bg-[rgba(12,12,12,0.98)] border border-white/[0.07] shadow-[0_40px_90px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08, duration: 0.4 }}
                        className="text-center"
                    >
                        <h1 className="text-[42px] font-semibold text-white leading-none mb-2.5 tracking-[-0.04em]">
                            Volt
                        </h1>
                        <p className="text-[13px] text-white/35 tracking-wide">
                            Your system, at your fingertips.
                        </p>
                    </motion.div>

                    <motion.img
                        src={logo}
                        alt="Volt"
                        className="w-28 h-28 object-contain"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.18, duration: 0.5, ease: EASE }}
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.28, duration: 0.4 }}
                        className="flex flex-col items-center gap-2.5 w-full"
                    >
                        <button
                            onClick={() => close(true)}
                            className="w-full py-2.5 rounded-xl text-[13px] font-medium text-black transition-all duration-150 hover:opacity-90 active:scale-[0.98] bg-white"
                        >
                            Take the tour [Enter]
                        </button>
                        <button
                            onClick={() => close(false)}
                            className="text-[11px] text-white/20 hover:text-white/45 transition-colors duration-150 py-1"
                        >
                            Skip
                        </button>
                    </motion.div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
