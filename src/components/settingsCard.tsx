import {ReactNode, useState} from "react";
import { Button } from "@/components/ui/button.tsx";
import {AlertTriangle, LucideIcon} from "lucide-react";
import { showToast } from "@/components/toast.tsx";
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
        className="px-5 py-4 rounded-xl transition-all duration-200"
        style={{
            background: "rgba(255,255,255,0.03)",
            border: isDestructive ? "1px solid rgba(239,68,68,0.15)" : "1px solid rgba(255,255,255,0.07)",
        }}
    >
        <div className="flex items-center justify-between gap-6">
            <div className="flex gap-3.5 items-center">
                {Icon && (
                    <div className={`p-2 rounded-lg shrink-0 inline-flex ${
                        isDestructive ? 'bg-red-500/10 text-red-400/70' : ''
                    }`} style={isDestructive ? {} : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <Icon size={16} className={isDestructive ? "" : "text-white/40"} />
                    </div>
                )}
                <div className="space-y-0.5">
                    <h3 className={`text-[13px] font-medium tracking-tight ${isDestructive ? 'text-red-400/80' : 'text-white/80'}`}>
                        {title}
                    </h3>
                    <p className="text-[12px] text-white/35 max-w-110 leading-relaxed">
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
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await window.electronStore.set("searchHistory", "[]");
            showToast("History Cleared", "Your search history has been removed.");
        } catch {
            showToast("Error", "Failed to delete history.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-lg text-[13px] text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-colors" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                    Clear
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 p-4 rounded-xl shadow-2xl" style={{ background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <DropdownMenuLabel className="mb-1 text-[13px] text-white/80">Delete search history?</DropdownMenuLabel>
                <p className="text-[12px] text-white/35 mb-4">This will clear your recent query suggestions. This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="text-white/35 hover:text-white/65 text-[12px]">Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting} className="rounded-lg text-[12px]">
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
            await window.electronStore.clear();
            showToast("App Reset", "All data has been wiped successfully.");
        } catch {
            showToast("Error", "Failed to reset data.");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-lg text-[13px] text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-colors" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                    Factory Reset
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 p-5 rounded-xl shadow-2xl" style={{ background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <DropdownMenuLabel className="mb-2 text-[13px] text-red-400/80 flex items-center gap-2">
                    <AlertTriangle size={14} /> Danger Zone
                </DropdownMenuLabel>
                <p className="mb-4 text-[12px] text-white/35 leading-relaxed">
                    This will delete all indexed folders, custom bangs, and your settings. The app will restart.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="text-white/35 hover:text-white/65 text-[12px]">Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleReset} disabled={isResetting} className="text-[12px]">
                        {isResetting ? "Resetting..." : "Confirm Reset"}
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}