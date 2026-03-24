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
        <div className="space-y-8">
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-[22px] font-semibold text-white tracking-[-0.03em] mb-1.5">Search Index</h2>
                    <p className="text-white/40 text-[13px]">
                        Add folders to make their contents searchable instantly.
                        {cachedFolders.length > 0 && (
                            <span className="ml-2 text-white/25">
                                {cachedFolders.length} folder{cachedFolders.length !== 1 ? "s" : ""} indexed
                                {totalFiles > 0 && <span> &middot; {totalFiles.toLocaleString()} files</span>}
                            </span>
                        )}
                    </p>
                </div>
                <Button onClick={onAddFolder} className="bg-white text-black hover:bg-white/90 rounded-xl px-5 h-9 text-[13px] font-medium transition-all active:scale-95">
                    <Plus size={18} className="mr-2" />
                    Add Folder
                </Button>
            </div>

            <div className="grid gap-3">
                {cachedFolders.length === 0 && !loadingCachedFolders.length && (
                    <div className="py-12 text-center rounded-2xl border border-dashed border-white/[0.07]">
                        <FolderOpen className="mx-auto text-white/15 mb-4" size={36} strokeWidth={1} />
                        <p className="text-white/25 text-[13px]">No folders indexed yet.</p>
                    </div>
                )}
                {cachedFolders.map((folder, index) => {
                    const count = fileCounts[folder];
                    return (
                        <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all group bg-white/[0.03] border border-white/[0.07]">
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <div className="p-2 rounded-lg shrink-0 bg-white/[0.06] border border-white/8">
                                    <Folder size={16} className="text-white/40" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-[13px] truncate text-white/65 font-medium block">{folder}</span>
                                    {count !== undefined && (
                                        <span className="text-[11px] text-white/25">{count.toLocaleString()} file{count !== 1 ? "s" : ""}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/60" onClick={() => window.file.openInExplorer(folder)}>
                                    <ExternalLink size={14} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400" onClick={() => deleteFolder(folder)}>
                                    {removingFolder === folder ? <Spinner /> : <Trash size={14} />}
                                </Button>
                            </div>
                        </div>
                    );
                })}
                {loadingCachedFolders.map((folder, index) => (
                    <div key={`loading-${index}`} className="flex items-center justify-between px-4 py-3 rounded-xl animate-pulse bg-white/[0.02] border border-white/5">
                        <span className="text-[13px] text-white/25">{folder}</span>
                        <Spinner />
                    </div>
                ))}
            </div>
        </div>
    );
}
