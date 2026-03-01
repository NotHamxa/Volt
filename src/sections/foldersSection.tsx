import { Button } from "@/components/ui/button.tsx";
import { Plus, Trash, Folder, FolderOpen, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";

interface FoldersSectionProps {
    cachedFolders: string[];
    loadingCachedFolders: string[];
    removingFolder: string | null;
    onAddFolder: () => void;
    deleteFolder: (path: string) => void;
}

export default function FoldersSection({
                                               cachedFolders,
                                               loadingCachedFolders,
                                               removingFolder,
                                               onAddFolder,
                                               deleteFolder
                                           }: FoldersSectionProps) {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-[22px] font-semibold text-white tracking-[-0.03em] mb-1.5">Search Index</h2>
                    <p className="text-white/40 text-[13px]">Add folders to make their contents searchable instantly.</p>
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
                {cachedFolders.map((folder, index) => (
                    <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all group bg-white/[0.03] border border-white/[0.07]">
                        <div className="flex items-center gap-3.5 min-w-0">
                            <div className="p-2 rounded-lg shrink-0 bg-white/[0.06] border border-white/8">
                                <Folder size={16} className="text-white/40" />
                            </div>
                            <span className="text-[13px] truncate text-white/65 font-medium">{folder}</span>
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
                ))}
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