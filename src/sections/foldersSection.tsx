import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Plus, Trash, Folder, FolderOpen, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";

export default function FoldersSection() {
    const [cachedFolders, setCachedFolders] = useState<string[]>([]);
    const [loadingCachedFolders, setLoadingCachedFolders] = useState<string[]>([]);
    const [removingFolder, setRemovingFolder] = useState<string | null>(null);
    const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
    const selectingFolder = useRef(false);

    const loadData = async () => {
        const folders = await window.electronStore.get("cachedFolders");
        setCachedFolders(JSON.parse(folders || "[]"));
        const counts = await window.electron.getFolderFileCounts();
        setFileCounts(counts);
    };

    useEffect(() => {
        loadData();
    }, []);

    const onAddFolder = async () => {
        if (selectingFolder.current) return;
        selectingFolder.current = true;
        const folder = await window.electron.showFolderDialog();
        selectingFolder.current = false;
        if (!folder) return;
        if (cachedFolders.includes(folder)) {
            window.electron.notify("Note", "This folder is already indexed.");
            return;
        }
        setLoadingCachedFolders(prev => [...prev, folder]);
        await window.file.cacheFolder(folder);
        setCachedFolders(prev => [...prev, folder]);
        setLoadingCachedFolders(prev => prev.filter(f => f !== folder));
        const counts = await window.electron.getFolderFileCounts();
        setFileCounts(counts);
    };

    const deleteFolder = async (path: string) => {
        setRemovingFolder(path);
        const success = await window.electron.deleteFolder(path);
        if (success) {
            setCachedFolders(prev => prev.filter(f => f !== path));
            window.electron.notify("Removed", "Folder removed from index.");
        }
        setRemovingFolder(null);
    };

    const totalFiles = cachedFolders.reduce((sum, f) => sum + (fileCounts[f] || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[12px] text-white/40 leading-relaxed">
                        Add folders to make their contents searchable instantly.
                    </p>
                    {cachedFolders.length > 0 && (
                        <p className="text-white/25 text-[11px] mt-1.5">
                            {cachedFolders.length} folder{cachedFolders.length !== 1 ? "s" : ""} indexed
                            {totalFiles > 0 && <span> · {totalFiles.toLocaleString()} files</span>}
                        </p>
                    )}
                </div>
                <Button onClick={onAddFolder} className="bg-white text-black hover:bg-white/90 rounded-md px-3 h-8 text-[12px] font-medium transition-all active:scale-95 shrink-0">
                    <Plus size={14} className="mr-1.5" />
                    Add Folder
                </Button>
            </div>

            <div className="grid gap-1.5">
                {cachedFolders.length === 0 && !loadingCachedFolders.length && (
                    <div className="py-10 text-center rounded-lg border border-dashed border-white/[0.06]">
                        <FolderOpen className="mx-auto text-white/15 mb-3" size={28} strokeWidth={1.2} />
                        <p className="text-white/30 text-[12px]">No folders indexed yet.</p>
                    </div>
                )}
                {cachedFolders.map((folder, index) => {
                    const count = fileCounts[folder];
                    return (
                        <div key={index} className="flex items-center justify-between px-3 py-2.5 rounded-md transition-colors group bg-white/[0.025] border border-white/[0.05] hover:border-white/[0.09]">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="p-1.5 rounded-md shrink-0 bg-white/[0.04] border border-white/[0.07]">
                                    <Folder size={13} className="text-white/45" strokeWidth={1.8} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-[12px] truncate text-white/70 font-medium block">{folder}</span>
                                    {count !== undefined && (
                                        <span className="text-[10px] text-white/25">{count.toLocaleString()} file{count !== 1 ? "s" : ""}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-white/[0.06] text-white/30 hover:text-white/65" onClick={() => window.file.openInExplorer(folder)}>
                                    <ExternalLink size={12} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-red-500/12 text-white/30 hover:text-red-400" onClick={() => deleteFolder(folder)}>
                                    {removingFolder === folder ? <Spinner /> : <Trash size={12} />}
                                </Button>
                            </div>
                        </div>
                    );
                })}
                {loadingCachedFolders.map((folder, index) => (
                    <div key={`loading-${index}`} className="flex items-center justify-between px-3 py-2.5 rounded-md animate-pulse bg-white/[0.015] border border-white/[0.04]">
                        <span className="text-[12px] text-white/25 truncate">{folder}</span>
                        <Spinner />
                    </div>
                ))}
            </div>
        </div>
    );
}
