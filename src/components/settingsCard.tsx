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
    <div className={`p-5 rounded-xl border transition-all duration-200 bg-white/3 ${
        isDestructive
            ? 'border-red-500/20 hover:bg-red-500/5'
            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
    }`}>
        <div className="flex items-start justify-between gap-6">
            <div className="flex gap-4 items-center">
                {Icon && (
                    <div className={`p-2.5 rounded-lg shrink-0 inline-flex ${
                        isDestructive ? 'bg-red-500/10 text-red-400' : 'bg-white/10 text-gray-400'
                    }`}>
                        <Icon size={20} />
                    </div>
                )}
                <div className="space-y-1">
                    <h3 className={`font-medium tracking-tight ${isDestructive ? 'text-red-400' : 'text-white'}`}>
                        {title}
                    </h3>
                    <p className="text-sm text-gray-400 max-w-110 leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
            <div className="shrink-0 pt-1">
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
                <Button variant="outline" className="rounded-lg border-white/10 bg-transparent hover:bg-red-500/10 hover:text-red-400">
                    Clear
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 p-4 bg-[#1a1a1a] border-white/10 rounded-xl shadow-2xl">
                <DropdownMenuLabel className="mb-1 text-white">Delete search history?</DropdownMenuLabel>
                <p className="text-xs text-gray-400 mb-4">This will clear your recent query suggestions. This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting} className="rounded-lg">
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
                <Button variant="outline" className="rounded-lg border-white/10 bg-transparent hover:bg-red-600 hover:text-white transition-colors">
                    Factory Reset
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 p-5 bg-[#1a1a1a] border-white/10 rounded-xl shadow-2xl">
                <DropdownMenuLabel className="mb-2 text-red-400 flex items-center gap-2">
                    <AlertTriangle size={16} /> Danger Zone
                </DropdownMenuLabel>
                <p className="mb-4 text-sm text-gray-400 leading-relaxed">
                    This will delete all indexed folders, custom bangs, and your settings. The app will restart.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm">Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleReset} disabled={isResetting}>
                        {isResetting ? "Resetting..." : "Confirm Reset"}
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}