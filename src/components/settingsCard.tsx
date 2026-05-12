import {ReactNode, useState} from "react";
import { Button } from "@/components/ui/button.tsx";
import {AlertTriangle, LucideIcon} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";

interface SettingCardProps {
    title: string;
    description: string;
    children: ReactNode;
    icon?: LucideIcon;
    isDestructive?: boolean;
}

export const SettingCard = ({ title, description, children, icon: Icon, isDestructive = false }: SettingCardProps) => (
    <div
        className={`px-4 py-3 rounded-lg transition-colors duration-150 bg-white/[0.025] ${
            isDestructive
                ? "border border-red-500/[0.12] hover:border-red-500/[0.18]"
                : "border border-white/[0.05] hover:border-white/[0.09]"
        }`}
    >
        <div className="flex items-center justify-between gap-5">
            <div className="flex gap-3 items-center min-w-0">
                {Icon && (
                    <div className={`p-1.5 rounded-md shrink-0 inline-flex ${
                        isDestructive
                            ? 'bg-red-500/[0.08] text-red-400/70'
                            : 'bg-white/[0.04] border border-white/[0.07] text-white/45'
                    }`}>
                        <Icon size={13} strokeWidth={1.8} />
                    </div>
                )}
                <div className="min-w-0">
                    <h3 className={`text-[12.5px] font-medium tracking-tight ${isDestructive ? 'text-red-400/80' : 'text-white/80'}`}>
                        {title}
                    </h3>
                    <p className="text-[11px] text-white/35 max-w-110 leading-relaxed mt-0.5">
                        {description}
                    </p>
                </div>
            </div>
            <div className="shrink-0">
                {children}
            </div>
        </div>
    </div>
);

export function DeleteHistorySection() {
    const [open, setOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await window.electronStore.set("searchHistory", "[]");
            window.electron.notify("History Cleared", "Your search history has been removed.");
        } catch {
            window.electron.notify("Error", "Failed to delete history.");
        } finally {
            setIsDeleting(false);
            setOpen(false);
        }
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 rounded-md text-[12px] text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-colors border-white/[0.08]">
                    Clear
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 p-4 rounded-xl shadow-2xl bg-[rgba(12,12,12,0.98)] border border-white/[0.07]">
                <DropdownMenuLabel className="mb-1 text-[12.5px] text-white/80">Delete search history?</DropdownMenuLabel>
                <p className="text-[11px] text-white/35 mb-4 leading-relaxed">This will clear your recent query suggestions. This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-white/35 hover:text-white/65 text-[11px]">Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting} className="rounded-md text-[11px]">
                        {isDeleting ? "Deleting..." : "Confirm"}
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function ResetAppData() {
    const [open, setOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const handleReset = async () => {
        setIsResetting(true);
        try {
            await window.electronStore.clear();
            window.electron.notify("App Reset", "All data has been wiped successfully.");
        } catch {
            window.electron.notify("Error", "Failed to reset data.");
        } finally {
            setIsResetting(false);
            setOpen(false);
        }
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 rounded-md text-[12px] text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-colors border-white/[0.08]">
                    Factory Reset
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 p-5 rounded-xl shadow-2xl bg-[rgba(12,12,12,0.98)] border border-white/[0.07]">
                <DropdownMenuLabel className="mb-2 text-[12.5px] text-red-400/80 flex items-center gap-2">
                    <AlertTriangle size={13} /> Danger Zone
                </DropdownMenuLabel>
                <p className="mb-4 text-[11px] text-white/35 leading-relaxed">
                    This will delete all indexed folders, custom bangs, and your settings. The app will restart.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-white/35 hover:text-white/65 text-[11px]">Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleReset} disabled={isResetting} className="text-[11px]">
                        {isResetting ? "Resetting..." : "Confirm Reset"}
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
