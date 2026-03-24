import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Plus, Trash, Terminal, FileUp, FileDown, Pencil, Search, X, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SearchQueryT } from "@/interfaces/searchQuery.ts";

function ExpandablePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (open && contentRef.current) {
            setHeight(contentRef.current.scrollHeight);
        } else {
            setHeight(0);
        }
    }, [open]);

    return (
        <div
            className="overflow-hidden transition-all duration-300 ease-out"
            style={{ maxHeight: open ? height + 16 : 0, opacity: open ? 1 : 0 }}
        >
            <div ref={contentRef}>{children}</div>
        </div>
    );
}

export default function CommandsSection() {
    const [commands, setCommands] = useState<SearchQueryT[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [name, setName] = useState("");
    const [path, setPath] = useState("");
    const [requireConfirm, setRequireConfirm] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [editingCmd, setEditingCmd] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPath, setEditPath] = useState("");
    const [editConfirm, setEditConfirm] = useState(false);

    const loadCommands = async () => {
        const data = await window.apps.getCustomCommands();
        setCommands(data);
        setLoading(false);
    };

    useEffect(() => {
        loadCommands();
    }, []);

    const handleAdd = async () => {
        if (!name.trim() || !path.trim()) {
            window.electron.notify("Missing Fields", "Both name and command are required.");
            return;
        }
        const command: SearchQueryT = {
            name: name.trim(),
            type: requireConfirm ? "commandConfirm" : "command",
            appId: "",
            path: path.trim(),
            source: "custom"
        };
        await window.apps.addCustomCommand(command);
        setName("");
        setPath("");
        setRequireConfirm(false);
        setShowAddForm(false);
        await loadCommands();
        window.electron.notify("Command Added", `"${command.name}" is now available in search.`);
    };

    const handleRemove = async (commandName: string) => {
        setRemoving(commandName);
        await window.apps.removeCustomCommand(commandName);
        await loadCommands();
        setRemoving(null);
    };

    const handleImport = async () => {
        const imported = await window.apps.importCommandsFile();
        if (imported) {
            await loadCommands();
            window.electron.notify("Commands Imported", `${imported.length} command(s) imported.`);
        }
    };

    const handleExport = async () => {
        const success = await window.apps.exportCommandsFile();
        if (success) {
            window.electron.notify("Exported", "Commands saved to file.");
        }
    };

    const startEdit = (cmd: SearchQueryT) => {
        setEditingCmd(cmd.name);
        setEditName(cmd.name);
        setEditPath(cmd.path || "");
        setEditConfirm(cmd.type === "commandConfirm");
    };

    const cancelEdit = () => {
        setEditingCmd(null);
    };

    const saveEdit = async () => {
        if (!editName.trim() || !editPath.trim()) return;
        const updated: SearchQueryT = {
            name: editName.trim(),
            type: editConfirm ? "commandConfirm" : "command",
            appId: "",
            path: editPath.trim(),
            source: "custom"
        };
        await window.apps.updateCustomCommand(editingCmd!, updated);
        setEditingCmd(null);
        await loadCommands();
    };

    const filtered = filter.trim()
        ? commands.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || (c.path || "").toLowerCase().includes(filter.toLowerCase()))
        : commands;

    return (
        <div className="space-y-8">
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-[22px] font-semibold text-white tracking-[-0.03em] mb-1.5">Commands</h2>
                    <p className="text-white/40 text-[13px]">Add custom shell commands that appear in search results.</p>
                </div>
                <div className="flex gap-2">
                    {commands.length > 0 && (
                        <Button onClick={handleExport} variant="outline" className="border-white/10 hover:bg-white/8 hover:border-white/15 rounded-xl px-4 h-9 text-[13px] font-medium transition-all active:scale-95 text-white/60 hover:text-white/80">
                            <FileDown size={16} className="mr-2" />
                            Export
                        </Button>
                    )}
                    <Button onClick={handleImport} variant="outline" className="border-white/10 hover:bg-white/8 hover:border-white/15 rounded-xl px-4 h-9 text-[13px] font-medium transition-all active:scale-95 text-white/60 hover:text-white/80">
                        <FileUp size={16} className="mr-2" />
                        Import
                    </Button>
                    <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-white text-black hover:bg-white/90 rounded-xl px-5 h-9 text-[13px] font-medium transition-all active:scale-95">
                        <Plus size={18} className="mr-2" />
                        Add Command
                    </Button>
                </div>
            </div>

            <ExpandablePanel open={showAddForm}>
                <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-4">
                    <div className="space-y-2">
                        <label className="text-[12px] font-medium text-white/50 uppercase tracking-wider">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Clear Temp Files"
                            className="w-full h-9 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-[13px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[12px] font-medium text-white/50 uppercase tracking-wider">Shell Command</label>
                        <input
                            type="text"
                            value={path}
                            onChange={e => setPath(e.target.value)}
                            placeholder='e.g. del /q /f %temp%\*'
                            className="w-full h-9 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-[13px] text-white/80 font-mono placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                        />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <button
                                onClick={() => setRequireConfirm(!requireConfirm)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                                    requireConfirm ? "bg-white border-white" : "bg-white/10 border-white/10"
                                }`}
                                role="switch"
                                aria-checked={requireConfirm}
                            >
                                <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow transition duration-200 ease-in-out mt-[1px] ${
                                    requireConfirm ? "translate-x-3.5 bg-black" : "translate-x-0.5 bg-white/40"
                                }`} />
                            </button>
                            <span className="text-[13px] text-white/50">Require confirmation before running</span>
                        </label>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setShowAddForm(false)} className="h-9 rounded-xl text-[13px] text-white/40 hover:text-white/60">
                                Cancel
                            </Button>
                            <Button onClick={handleAdd} className="bg-white text-black hover:bg-white/90 rounded-xl px-5 h-9 text-[13px] font-medium">
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            </ExpandablePanel>

            {/* Filter input */}
            {commands.length > 3 && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={15} />
                    <input
                        type="text"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter commands..."
                        className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/8 text-[13px] text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
                    />
                    {filter && (
                        <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50">
                            <X size={14} />
                        </button>
                    )}
                </div>
            )}

            <div className="grid gap-3">
                {loading ? (
                    <div className="py-12 flex justify-center"><Spinner /></div>
                ) : commands.length === 0 && !showAddForm ? (
                    <div className="py-12 text-center rounded-2xl border border-dashed border-white/[0.07]">
                        <Terminal className="mx-auto text-white/15 mb-4" size={36} strokeWidth={1} />
                        <p className="text-white/25 text-[13px]">No custom commands yet.</p>
                        <p className="text-white/15 text-[12px] mt-1">Add commands or import from a JSON file.</p>
                    </div>
                ) : (
                    filtered.map((cmd, index) => (
                        editingCmd === cmd.name ? (
                            <div key={index} className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.12] space-y-3">
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        className="flex-1 h-8 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-[13px] text-white/80 focus:outline-none focus:border-white/20 transition-colors"
                                        placeholder="Name"
                                    />
                                    <input
                                        type="text"
                                        value={editPath}
                                        onChange={e => setEditPath(e.target.value)}
                                        className="flex-[2] h-8 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-[13px] text-white/80 font-mono focus:outline-none focus:border-white/20 transition-colors"
                                        placeholder="Command"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <button
                                            onClick={() => setEditConfirm(!editConfirm)}
                                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                                                editConfirm ? "bg-white border-white" : "bg-white/10 border-white/10"
                                            }`}
                                            role="switch"
                                            aria-checked={editConfirm}
                                        >
                                            <span className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full shadow transition duration-200 ease-in-out mt-[1px] ${
                                                editConfirm ? "translate-x-2.5 bg-black" : "translate-x-0.5 bg-white/40"
                                            }`} />
                                        </button>
                                        <span className="text-[11px] text-white/40">Confirm</span>
                                    </label>
                                    <div className="flex gap-1.5">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8" onClick={cancelEdit}>
                                            <X size={13} />
                                        </Button>
                                        <Button size="icon" className="h-7 w-7 rounded-lg bg-white text-black hover:bg-white/90" onClick={saveEdit}>
                                            <Check size={13} />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div key={index} className="flex items-center justify-between px-4 py-3 rounded-xl transition-all group bg-white/[0.03] border border-white/[0.07]">
                                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                    <div className="p-2 rounded-lg shrink-0 bg-white/[0.06] border border-white/8">
                                        <Terminal size={16} className="text-white/40" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13px] text-white/65 font-medium">{cmd.name}</span>
                                            {cmd.type === "commandConfirm" && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/70 font-medium">confirm</span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-white/25 font-mono truncate block">{cmd.path}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/8 text-white/30 hover:text-white/60" onClick={() => startEdit(cmd)}>
                                        <Pencil size={13} />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400" onClick={() => handleRemove(cmd.name)}>
                                        {removing === cmd.name ? <Spinner /> : <Trash size={14} />}
                                    </Button>
                                </div>
                            </div>
                        )
                    ))
                )}
                {!loading && commands.length > 0 && filtered.length === 0 && filter && (
                    <div className="py-8 text-center text-white/25 text-[13px]">No commands match "{filter}"</div>
                )}
            </div>

            <div className="pt-4 border-t border-white/5">
                <p className="text-[11px] text-white/20 leading-relaxed">
                    Import format: a JSON array of objects with <code className="text-white/30">name</code> and <code className="text-white/30">path</code> fields.
                    Optionally set <code className="text-white/30">type</code> to <code className="text-white/30">"commandConfirm"</code> for confirmation prompts.
                </p>
            </div>
        </div>
    );
}
