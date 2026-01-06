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
                    <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">Search Index</h2>
                    <p className="text-gray-400 text-sm">Add folders to make their contents searchable instantly.</p>
                </div>
                <Button onClick={onAddFolder} className="bg-white text-black hover:bg-gray-200 rounded-xl px-5 h-11 font-medium shadow-xl shadow-white/5 transition-all active:scale-95">
                    <Plus size={18} className="mr-2" />
                    Add Folder
                </Button>
            </div>

            <div className="grid gap-3">
                {cachedFolders.length === 0 && !loadingCachedFolders.length && (
                    <div className="py-12 text-center rounded-2xl border border-dashed border-white/10 bg-white/1">
                        <FolderOpen className="mx-auto text-gray-600 mb-4" size={40} strokeWidth={1} />
                        <p className="text-gray-500 text-sm">No folders indexed yet.</p>
                    </div>
                )}
                {cachedFolders.map((folder, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-xl bg-white/3 border border-white/10 hover:border-white/20 transition-all group">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                <Folder size={18} />
                            </div>
                            <span className="text-sm truncate text-gray-300 font-medium">{folder}</span>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-white/10" onClick={() => window.file.openInExplorer(folder)}>
                                <ExternalLink size={16} className="text-gray-400" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-red-500/20" onClick={() => deleteFolder(folder)}>
                                {removingFolder === folder ? <Spinner /> : <Trash size={16} className="text-gray-400 hover:text-red-400" />}
                            </Button>
                        </div>
                    </div>
                ))}
                {loadingCachedFolders.map((folder, index) => (
                    <div key={`loading-${index}`} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.01] border border-white/5 animate-pulse">
                        <span className="text-sm text-gray-500">{folder}</span>
                        <Spinner />
                    </div>
                ))}
            </div>
        </div>
    );
}