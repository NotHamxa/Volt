import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Wrench, Bug } from "lucide-react";
import { ChangelogEntry } from "@/data/changelog.ts";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const sectionIcons: Record<string, ReactNode> = {
    "New Features": <Sparkles size={13} className="text-tone-500" strokeWidth={1.5} />,
    "Improvements": <Wrench size={13} className="text-tone-500" strokeWidth={1.5} />,
    "Bug Fixes": <Bug size={13} className="text-tone-500" strokeWidth={1.5} />,
};

interface UpdateModalProps {
    open: boolean;
    onClose: () => void;
    changelog: ChangelogEntry | null;
    version: string;
}

export function UpdateModal({ open, onClose, changelog, version }: UpdateModalProps) {
    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="update-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--shadow-3)] backdrop-blur-[8px]"
            >
                <motion.div
                    initial={{ scale: 0.93, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.93, opacity: 0, y: 16 }}
                    transition={{ duration: 0.38, ease: EASE }}
                    className="relative flex flex-col w-[420px] overflow-hidden rounded-2xl bg-surface-modal/[0.98] border border-line-070 shadow-[0_40px_90px_var(--shadow-3),inset_0_1px_0_var(--edge-hi)] max-h-[500px]"
                >
                    {/* Header */}
                    <div className="px-7 pt-7 pb-4">
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-fill-060 border border-line-090">
                                <Sparkles size={15} className="text-tone-600" strokeWidth={1.5} />
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-widest text-tone-200">Updated to</p>
                                <h2 className="text-[18px] font-semibold text-ink tracking-[-0.02em] leading-tight">
                                    v{version}
                                </h2>
                            </div>
                        </div>

                        {changelog?.highlights && (
                            <div className="mt-4 flex flex-col gap-1.5">
                                {changelog.highlights.map((h, i) => (
                                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-fill-030 border border-line-060">
                                        <ArrowRight size={11} className="text-tone-300 shrink-0" />
                                        <span className="text-[12px] text-tone-600">{h}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Scrollable sections */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-7 pb-2 [scrollbar-width:none]">
                        {changelog?.sections.map((section, si) => (
                            <div key={si} className="mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    {sectionIcons[section.title] ?? <Sparkles size={13} className="text-tone-500" strokeWidth={1.5} />}
                                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-tone-300">
                                        {section.title}
                                    </h3>
                                </div>
                                <div className="flex flex-col gap-1">
                                    {section.items.map((item, ii) => (
                                        <div key={ii} className="flex items-start gap-2 pl-1">
                                            <span className="mt-1.5 w-1 h-1 rounded-full bg-fill-150 shrink-0" />
                                            <span className="text-[12px] text-tone-450 leading-relaxed">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {!changelog && (
                            <div className="py-6 text-center">
                                <p className="text-[13px] text-tone-400">Volt has been updated to v{version}.</p>
                                <p className="text-[12px] text-tone-250 mt-1">Check the changelog for details.</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-7 py-4 border-t border-line-050">
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 rounded-xl text-[13px] font-medium text-surface transition-all duration-150 hover:opacity-90 active:scale-[0.98] bg-ink"
                        >
                            Got it
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
