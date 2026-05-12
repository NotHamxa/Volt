import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Plus, Trash, Terminal, FileUp, FileDown, FileJson, Pencil, Search, X, Check, SquareTerminal, BookOpen } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SearchQueryT, CommandArgDef } from "@/interfaces/searchQuery.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useEscape } from "@/hooks/useEscape.ts";

type ShellChoice = "auto" | "cmd" | "powershell";
const ARG_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function ShellSelector({ value, onChange }: { value: ShellChoice; onChange: (v: ShellChoice) => void }) {
    const opts: { id: ShellChoice; label: string }[] = [
        { id: "auto", label: "Auto" },
        { id: "cmd", label: "CMD" },
        { id: "powershell", label: "PowerShell" },
    ];
    return (
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
            {opts.map(o => (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => onChange(o.id)}
                    className={`px-2 h-6 text-[10.5px] rounded transition-colors ${
                        value === o.id ? "bg-white/[0.08] text-white/85" : "text-white/45 hover:text-white/70"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function ArgsEditor({ args, onChange }: { args: CommandArgDef[]; onChange: (next: CommandArgDef[]) => void }) {
    const update = (i: number, patch: Partial<CommandArgDef>) => {
        onChange(args.map((a, idx) => idx === i ? { ...a, ...patch } : a));
    };
    const remove = (i: number) => onChange(args.filter((_, idx) => idx !== i));
    const add = () => onChange([...args, { name: "", required: false }]);

    return (
        <div className="space-y-1.5">
            {args.map((a, i) => {
                const nameInvalid = a.name.length > 0 && !ARG_NAME_PATTERN.test(a.name);
                return (
                    <div key={i} className="p-2 rounded-md bg-white/[0.025] border border-white/[0.06] space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <input
                                value={a.name}
                                onChange={e => update(i, { name: e.target.value })}
                                placeholder="argName"
                                className={`flex-1 min-w-0 h-7 px-2 rounded bg-white/[0.04] border text-[11.5px] font-mono text-white/80 focus:outline-none transition-colors ${
                                    nameInvalid ? "border-red-500/40 focus:border-red-500/60" : "border-white/[0.08] focus:border-white/[0.18]"
                                }`}
                            />
                            <input
                                value={a.defaultValue ?? ""}
                                onChange={e => update(i, { defaultValue: e.target.value || undefined })}
                                placeholder="default (optional)"
                                className="flex-1 min-w-0 h-7 px-2 rounded bg-white/[0.04] border border-white/[0.08] text-[11.5px] text-white/80 focus:outline-none focus:border-white/[0.18] transition-colors"
                            />
                            <StyledCheckbox
                                checked={!!a.required}
                                onChange={v => update(i, { required: v })}
                                label="required"
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 shrink-0" onClick={() => remove(i)}>
                                <X size={11} />
                            </Button>
                        </div>
                        {nameInvalid && (
                            <p className="text-[10px] text-red-400/80">Name must start with a letter/underscore and contain only letters, digits, underscore.</p>
                        )}
                    </div>
                );
            })}
            <Button variant="outline" onClick={add} className="border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15] rounded-md px-2.5 h-7 text-[10.5px] font-medium transition-all text-white/55 hover:text-white/85 w-full">
                <Plus size={11} className="mr-1.5" />
                Add argument
            </Button>
            {args.length > 0 && (
                <p className="text-[10px] text-white/30 leading-relaxed pl-0.5">
                    Reference args in the script with <code className="text-white/45 font-mono">{"{argName}"}</code>. Values are quoted for the target shell automatically.
                </p>
            )}
        </div>
    );
}

function deriveCommandType(confirm: boolean, open: boolean): string {
    if (confirm && open) return "commandConfirmOpen";
    if (confirm) return "commandConfirm";
    if (open) return "commandOpen";
    return "command";
}

function isOpenType(t: string) {
    return t === "commandOpen" || t === "commandConfirmOpen";
}

function isConfirmType(t: string) {
    return t === "commandConfirm" || t === "commandConfirmOpen";
}

function ToggleSwitch({ checked, onChange, small = false }: { checked: boolean; onChange: () => void; small?: boolean }) {
    const wrap = small ? "h-4 w-7" : "h-5 w-9";
    const dot = small ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
    const trX = small ? "translate-x-2.5" : "translate-x-3.5";
    return (
        <button
            onClick={onChange}
            className={`relative inline-flex ${wrap} shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                checked ? "bg-white border-white" : "bg-white/10 border-white/10"
            }`}
            role="switch"
            aria-checked={checked}
        >
            <span className={`pointer-events-none inline-block ${dot} transform rounded-full shadow transition duration-200 ease-in-out mt-[1px] ${
                checked ? `${trX} bg-black` : "translate-x-0.5 bg-white/40"
            }`} />
        </button>
    );
}

function ExpandablePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    // Re-measure on content changes — adding args to the form should grow
    // the panel so the Save row never disappears under the clip.
    useEffect(() => {
        if (!open || !contentRef.current) {
            setHeight(0);
            return;
        }
        const el = contentRef.current;
        setHeight(el.scrollHeight);
        const ro = new ResizeObserver(() => setHeight(el.scrollHeight));
        ro.observe(el);
        return () => ro.disconnect();
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

function StyledCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-1.5 text-[10.5px] text-white/45 cursor-pointer select-none shrink-0 group">
            <button
                type="button"
                onClick={() => onChange(!checked)}
                role="checkbox"
                aria-checked={checked}
                className={`flex items-center justify-center w-3.5 h-3.5 rounded-[3px] border transition-colors ${
                    checked
                        ? "bg-white border-white"
                        : "bg-white/[0.04] border-white/[0.18] group-hover:border-white/[0.3]"
                }`}
            >
                {checked && (
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>
            {label}
        </label>
    );
}

export default function CommandsSection() {
    const [commands, setCommands] = useState<SearchQueryT[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [name, setName] = useState("");
    const [script, setScript] = useState("");
    const [requireConfirm, setRequireConfirm] = useState(false);
    const [openInTerminal, setOpenInTerminal] = useState(false);
    const [shell, setShell] = useState<ShellChoice>("auto");
    const [args, setArgs] = useState<CommandArgDef[]>([]);
    const [removing, setRemoving] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [editingCmd, setEditingCmd] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editScript, setEditScript] = useState("");
    const [editConfirm, setEditConfirm] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editShell, setEditShell] = useState<ShellChoice>("auto");
    const [editArgs, setEditArgs] = useState<CommandArgDef[]>([]);
    const [showPresets, setShowPresets] = useState(false);

    const loadCommands = async () => {
        const data = await window.apps.getCustomCommands();
        setCommands(data);
        setLoading(false);
    };

    useEffect(() => {
        loadCommands();
    }, []);

    const sanitizeArgs = (list: CommandArgDef[]): CommandArgDef[] | undefined => {
        const cleaned = list
            .map(a => ({ ...a, name: a.name.trim() }))
            .filter(a => a.name && ARG_NAME_PATTERN.test(a.name));
        return cleaned.length ? cleaned : undefined;
    };

    const handleAdd = async () => {
        if (!name.trim() || !script.trim()) {
            window.electron.notify("Missing Fields", "Both name and script are required.");
            return;
        }
        if (args.some(a => a.name && !ARG_NAME_PATTERN.test(a.name.trim()))) {
            window.electron.notify("Invalid argument name", "Argument names must start with a letter/underscore and contain only letters, digits, underscore.");
            return;
        }
        const command: SearchQueryT = {
            name: name.trim(),
            type: deriveCommandType(requireConfirm, openInTerminal),
            appId: "",
            path: script.trim(),
            source: "custom",
            shell,
            args: sanitizeArgs(args),
        };
        await window.apps.addCustomCommand(command);
        setName("");
        setScript("");
        setRequireConfirm(false);
        setOpenInTerminal(false);
        setShell("auto");
        setArgs([]);
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

    const handleImportScript = async () => {
        const result = await window.apps.importScriptFile();
        if (!result) return;
        setName(result.fileName);
        setScript(result.content);
        setShowAddForm(true);
    };

    const handleImportJson = async () => {
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
        setEditScript(cmd.path || "");
        setEditConfirm(isConfirmType(cmd.type));
        setEditOpen(isOpenType(cmd.type));
        setEditShell(cmd.shell ?? "auto");
        setEditArgs(cmd.args ? cmd.args.map(a => ({ ...a })) : []);
    };

    const cancelEdit = () => {
        setEditingCmd(null);
    };

    const saveEdit = async () => {
        if (!editName.trim() || !editScript.trim()) return;
        if (editArgs.some(a => a.name && !ARG_NAME_PATTERN.test(a.name.trim()))) {
            window.electron.notify("Invalid argument name", "Argument names must start with a letter/underscore and contain only letters, digits, underscore.");
            return;
        }
        const updated: SearchQueryT = {
            name: editName.trim(),
            type: deriveCommandType(editConfirm, editOpen),
            appId: "",
            path: editScript.trim(),
            source: "custom",
            shell: editShell,
            args: sanitizeArgs(editArgs),
        };
        await window.apps.updateCustomCommand(editingCmd!, updated);
        setEditingCmd(null);
        await loadCommands();
    };

    const filtered = filter.trim()
        ? commands.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || (c.path || "").toLowerCase().includes(filter.toLowerCase()))
        : commands;

    return (
        <div className="space-y-5 min-w-0 overflow-hidden">
            <div>
                <div className="flex items-start justify-between gap-4 mb-3">
                    <p className="text-[12px] text-white/40 leading-relaxed">Add custom shell commands and scripts that appear in search results.</p>
                    <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-white text-black hover:bg-white/90 rounded-md px-3 h-8 text-[12px] font-medium transition-all active:scale-95 shrink-0">
                        <Plus size={14} className="mr-1.5" />
                        Add Command
                    </Button>
                </div>
                <div className="flex gap-1.5">
                    <Button onClick={handleImportScript} variant="outline" className="border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15] rounded-md px-3 h-8 text-[11px] font-medium transition-all active:scale-95 text-white/55 hover:text-white/85">
                        <FileUp size={12} className="mr-1.5" />
                        Import Script
                    </Button>
                    <Button onClick={handleImportJson} variant="outline" className="border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15] rounded-md px-3 h-8 text-[11px] font-medium transition-all active:scale-95 text-white/55 hover:text-white/85">
                        <FileJson size={12} className="mr-1.5" />
                        Import JSON
                    </Button>
                    {commands.length > 0 && (
                        <Button onClick={handleExport} variant="outline" className="border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15] rounded-md px-3 h-8 text-[11px] font-medium transition-all active:scale-95 text-white/55 hover:text-white/85">
                            <FileDown size={12} className="mr-1.5" />
                            Export
                        </Button>
                    )}
                    <Button onClick={() => setShowPresets(true)} variant="outline" className="border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15] rounded-md px-3 h-8 text-[11px] font-medium transition-all active:scale-95 text-white/55 hover:text-white/85 ml-auto">
                        <BookOpen size={12} className="mr-1.5" />
                        Built-in
                    </Button>
                </div>
            </div>

            <ExpandablePanel open={showAddForm}>
                <div className="p-4 rounded-lg bg-white/[0.025] border border-white/[0.06] space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-white/45 uppercase tracking-[0.18em]">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Clear Temp Files"
                            className="w-full h-8 px-2.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[12px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/[0.18] transition-colors"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-white/45 uppercase tracking-[0.18em]">Script / Command</label>
                        <textarea
                            value={script}
                            onChange={e => setScript(e.target.value)}
                            placeholder={'e.g. del /q /f %temp%\\*\n\nOr import a .ps1 / .bat file to paste its content here'}
                            rows={5}
                            className="w-full px-2.5 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] text-[12px] text-white/80 font-mono placeholder:text-white/20 focus:outline-none focus:border-white/[0.18] transition-colors resize-none leading-relaxed [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/25"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-semibold text-white/45 uppercase tracking-[0.18em]">Shell</span>
                        <ShellSelector value={shell} onChange={setShell} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-white/45 uppercase tracking-[0.18em]">Arguments</label>
                        <ArgsEditor args={args} onChange={setArgs} />
                    </div>
                    <div className="flex items-center justify-between pt-1 gap-4 flex-wrap">
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <ToggleSwitch checked={requireConfirm} onChange={() => setRequireConfirm(!requireConfirm)} small />
                                <span className="text-[11.5px] text-white/55">Require confirmation before running</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <ToggleSwitch checked={openInTerminal} onChange={() => setOpenInTerminal(!openInTerminal)} small />
                                <span className="text-[11.5px] text-white/55">Open in a new terminal window <span className="text-white/30">(visible output)</span></span>
                            </label>
                        </div>
                        <div className="flex gap-1.5">
                            <Button variant="ghost" onClick={() => setShowAddForm(false)} className="h-8 rounded-md text-[11.5px] text-white/40 hover:text-white/65">
                                Cancel
                            </Button>
                            <Button onClick={handleAdd} className="bg-white text-black hover:bg-white/90 rounded-md px-4 h-8 text-[11.5px] font-medium">
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            </ExpandablePanel>

            {/* Filter input */}
            {commands.length > 3 && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={13} />
                    <input
                        type="text"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter commands..."
                        className="w-full h-8 pl-9 pr-3 rounded-md bg-white/[0.03] border border-white/[0.06] text-[12px] text-white/75 placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] transition-colors"
                    />
                    {filter && (
                        <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55">
                            <X size={12} />
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 gap-1.5 min-w-0">
                {loading ? (
                    <div className="py-10 flex justify-center"><Spinner /></div>
                ) : commands.length === 0 && !showAddForm ? (
                    <div className="py-10 text-center rounded-lg border border-dashed border-white/[0.06]">
                        <Terminal className="mx-auto text-white/15 mb-3" size={28} strokeWidth={1.2} />
                        <p className="text-white/30 text-[12px]">No custom commands yet.</p>
                        <p className="text-white/20 text-[11px] mt-0.5">Add commands or import a script file.</p>
                    </div>
                ) : (
                    filtered.map((cmd, index) => (
                        editingCmd === cmd.name ? (
                            <div key={index} className="p-3 rounded-md bg-white/[0.04] border border-white/[0.12] space-y-2.5">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full h-8 px-2.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[12px] text-white/85 focus:outline-none focus:border-white/[0.18] transition-colors"
                                    placeholder="Name"
                                />
                                <textarea
                                    value={editScript}
                                    onChange={e => setEditScript(e.target.value)}
                                    className="w-full px-2.5 py-2 rounded-md bg-white/[0.05] border border-white/[0.08] text-[12px] text-white/85 font-mono focus:outline-none focus:border-white/[0.18] transition-colors resize-none leading-relaxed [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/25"
                                    placeholder="Script / Command"
                                    rows={4}
                                />
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-semibold text-white/45 uppercase tracking-[0.18em]">Shell</span>
                                    <ShellSelector value={editShell} onChange={setEditShell} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-semibold text-white/45 uppercase tracking-[0.18em]">Arguments</label>
                                    <ArgsEditor args={editArgs} onChange={setEditArgs} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <ToggleSwitch checked={editConfirm} onChange={() => setEditConfirm(!editConfirm)} small />
                                            <span className="text-[11px] text-white/40">Confirm</span>
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <ToggleSwitch checked={editOpen} onChange={() => setEditOpen(!editOpen)} small />
                                            <span className="text-[11px] text-white/40">Open terminal</span>
                                        </label>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-white/30 hover:text-white/65 hover:bg-white/[0.06]" onClick={cancelEdit}>
                                            <X size={12} />
                                        </Button>
                                        <Button size="icon" className="h-7 w-7 rounded-md bg-white text-black hover:bg-white/90" onClick={saveEdit}>
                                            <Check size={12} />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div key={index} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md transition-colors group bg-white/[0.025] border border-white/[0.05] hover:border-white/[0.09] overflow-hidden">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="p-1.5 rounded-md shrink-0 bg-white/[0.04] border border-white/[0.07]">
                                        <Terminal size={13} className="text-white/45" strokeWidth={1.8} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[12px] text-white/75 font-medium truncate min-w-0">{cmd.name}</span>
                                            {cmd.shell && cmd.shell !== "auto" && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 font-medium uppercase tracking-wider shrink-0">{cmd.shell === "powershell" ? "ps" : "cmd"}</span>
                                            )}
                                            {cmd.args && cmd.args.length > 0 && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300/80 font-medium uppercase tracking-wider shrink-0">{cmd.args.length} arg{cmd.args.length === 1 ? "" : "s"}</span>
                                            )}
                                            {isConfirmType(cmd.type) && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/75 font-medium uppercase tracking-wider shrink-0">confirm</span>
                                            )}
                                            {isOpenType(cmd.type) && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400/75 font-medium uppercase tracking-wider inline-flex items-center gap-1 shrink-0">
                                                    <SquareTerminal size={9} /> terminal
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10.5px] text-white/25 font-mono truncate block mt-0.5 max-w-full">{(cmd.path || "").split("\n")[0]}{(cmd.path || "").includes("\n") ? " …" : ""}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-white/[0.06] text-white/30 hover:text-white/65" onClick={() => startEdit(cmd)}>
                                        <Pencil size={12} />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-red-500/12 text-white/30 hover:text-red-400" onClick={() => handleRemove(cmd.name)}>
                                        {removing === cmd.name ? <Spinner /> : <Trash size={12} />}
                                    </Button>
                                </div>
                            </div>
                        )
                    ))
                )}
                {!loading && commands.length > 0 && filtered.length === 0 && filter && (
                    <div className="py-7 text-center text-white/25 text-[12px]">No commands match "{filter}"</div>
                )}
            </div>

            <div className="pt-3 border-t border-white/[0.04]">
                <p className="text-[10.5px] text-white/25 leading-relaxed">
                    Import a <code className="text-white/40 font-mono">.ps1</code>, <code className="text-white/40 font-mono">.bat</code>, or <code className="text-white/40 font-mono">.cmd</code> file to auto-fill the script content.
                    Multi-line scripts are fully supported.
                </p>
            </div>

            <PresetCommandsModal open={showPresets} onClose={() => setShowPresets(false)} />
        </div>
    );
}

function PresetCommandsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [presets, setPresets] = useState<SearchQueryT[]>([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        window.apps.getPresetCommands().then(list => {
            setPresets(list ?? []);
            setLoading(false);
        });
    }, [open]);

    useEscape(onClose, open);

    const filtered = q.trim()
        ? presets.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.path || "").toLowerCase().includes(q.toLowerCase()))
        : presets;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[6px]" onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                className="w-[640px] h-[540px] flex flex-col rounded-2xl bg-[rgba(12,12,12,0.98)] border border-white/[0.07] shadow-[0_40px_90px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden"
            >
                <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/[0.05]">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-md bg-white/[0.04] border border-white/[0.07]">
                            <BookOpen size={13} className="text-white/55" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[13px] font-semibold text-white/85 tracking-[-0.01em]">Built-in Commands</h3>
                            <p className="text-[10.5px] text-white/35">Reference for the commands shipped with Volt.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md text-white/30 hover:text-white/75 hover:bg-white/[0.05] transition-colors"
                        aria-label="Close"
                    >
                        <X size={13} />
                    </button>
                </header>

                <div className="px-5 pt-3 pb-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" size={13} />
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Filter built-in commands..."
                            autoFocus
                            className="w-full h-8 pl-9 pr-3 text-[12px] rounded-md bg-white/[0.03] border border-white/[0.06] text-white/75 placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] transition-colors"
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1 min-h-0">
                    <div className="space-y-1 px-5 pb-4 pt-1">
                        {loading && (
                            <div className="py-10 flex justify-center"><Spinner /></div>
                        )}
                        {!loading && filtered.length === 0 && (
                            <div className="py-10 text-center text-white/25 text-[12px]">
                                {q ? `No built-in commands match "${q}".` : "No built-in commands available."}
                            </div>
                        )}
                        {!loading && filtered.map((p, i) => (
                            <div
                                key={`${p.name}-${i}`}
                                className="px-3 py-2 rounded-md bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.09] transition-colors"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Terminal size={11} className="text-white/40 shrink-0" strokeWidth={1.8} />
                                    <span className="text-[12px] font-medium text-white/80">{p.name}</span>
                                    {isConfirmType(p.type) && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/75 font-medium uppercase tracking-wider">confirm</span>
                                    )}
                                    {isOpenType(p.type) && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400/75 font-medium uppercase tracking-wider inline-flex items-center gap-1">
                                            <SquareTerminal size={9} /> terminal
                                        </span>
                                    )}
                                </div>
                                <code className="block text-[10.5px] font-mono text-white/40 leading-relaxed whitespace-pre-wrap break-all pl-[18px]">
                                    {p.path}
                                </code>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/[0.05]">
                    <span className="text-[10.5px] text-white/30">{filtered.length} of {presets.length} commands</span>
                    <button
                        onClick={onClose}
                        className="text-[11px] text-white/50 hover:text-white/85 px-3 py-1.5 rounded-md hover:bg-white/[0.05] transition-colors"
                    >
                        Close <span className="text-white/25 ml-1 font-mono">Esc</span>
                    </button>
                </footer>
            </div>
        </div>
    );
}
