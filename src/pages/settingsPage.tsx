import { useEffect, useRef, useState } from "react";
import { Settings, Hash, FolderOpen, Info } from "lucide-react";
import { showToast } from "@/components/toast.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import GeneralSettingsSection from "@/sections/generalSection.tsx";
import FoldersSection from "@/sections/foldersSection.tsx";
import QuickBangsSection from "@/sections/bangsSection.tsx";
import AboutSection from "@/sections/aboutSection.tsx";

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState<"settings" | "bangs" | "folders" | "about">("settings");
    const [listeningToKeyboard, setListeningToKeyboard] = useState<boolean>(false);
    const [openBind, setOpenBind] = useState<string>("");
    const [bindLoad, setBindLoad] = useState<boolean>(false);
    const [currentOpenBind, setCurrentOpenBind] = useState<string>("");
    const pressedKeysRef = useRef<Set<string>>(new Set());

    const [openOnStartup, setOpenOnStartup] = useState<boolean>(false);

    const [cachedFolders, setCachedFolders] = useState<string[]>([]);
    const [loadingCachedFolders, setLoadingCachedFolders] = useState<string[]>([]);
    const [removingFolder, setRemovingFolder] = useState<string | null>(null);
    const selectingFolder = useRef(false);

    const onLoad = async () => {
        const bind = await window.electronStore.get("openWindowBind");
        const folders = await window.electronStore.get("cachedFolders");
        setCurrentOpenBind(bind || "Not Set");
        setCachedFolders(JSON.parse(folders || "[]"));
        const startup = await window.electron.getOpenOnStartup();
        setOpenOnStartup(startup ?? false);
    };

    const toggleOpenOnStartup = async (enabled: boolean) => {
        setOpenOnStartup(enabled);
        await window.electron.setOpenOnStartup(enabled);
    };

    const formatKey = (code: string, key: string): string => {
        const keyMap: Record<string, string> = {
            ControlLeft: "Ctrl", ControlRight: "Ctrl", ShiftLeft: "Shift", ShiftRight: "Shift",
            AltLeft: "Alt", AltRight: "Alt", MetaLeft: "⌘", MetaRight: "⌘",
            Space: "Space", Escape: "Esc", ArrowUp: "Up", ArrowDown: "Down",
        };
        return keyMap[code] || key.toUpperCase();
    };

    const keyDownHandler = (e: KeyboardEvent) => {
        e.preventDefault();
        const formattedKey = formatKey(e.code, e.key);
        if (formattedKey === "+") return;
        pressedKeysRef.current.add(formattedKey);
        setOpenBind(Array.from(pressedKeysRef.current).slice(0, 3).join(" + "));
    };

    useEffect(() => {
        onLoad();
    }, []);

    useEffect(() => {
        if (listeningToKeyboard) {
            window.addEventListener("keydown", keyDownHandler);
        } else {
            window.removeEventListener("keydown", keyDownHandler);
            pressedKeysRef.current.clear();
            setOpenBind("");
        }
        return () => window.removeEventListener("keydown", keyDownHandler);
    }, [listeningToKeyboard]);

    const confirmChangeBind = async () => {
        if (pressedKeysRef.current.size < 2) {
            showToast("Invalid Shortcut", "Please use at least two keys (e.g., Alt + Space)");
            return;
        }
        const formattedKeys = Array.from(pressedKeysRef.current).slice(0, 3).join("+");
        setBindLoad(true);
        await window.electron.setOpenBind(formattedKeys);
        setBindLoad(false);
        showToast("Shortcut Updated", `New shortcut: ${formattedKeys}`);
        setCurrentOpenBind(formattedKeys);
        setListeningToKeyboard(false);
    };

    const onAddFolder = async () => {
        if (selectingFolder.current) return;
        selectingFolder.current = true;
        const folder = await window.electron.selectFolder();
        selectingFolder.current = false;
        if (!folder) return;
        if (cachedFolders.includes(folder)) {
            showToast("Note", "This folder is already indexed.");
            return;
        }
        setLoadingCachedFolders([...loadingCachedFolders, folder]);
        await window.file.cacheFolder(folder);
        setCachedFolders([...cachedFolders, folder]);
        setLoadingCachedFolders(loadingCachedFolders.filter(f => f !== folder));
    };

    const deleteFolder = async (path: string) => {
        setRemovingFolder(path);
        const success = await window.electron.deleteFolder(path);
        if (success) {
            setCachedFolders(cachedFolders.filter(f => f !== path));
            showToast("Removed", "Folder removed from index.");
        }
        setRemovingFolder(null);
    };

    const navItems = [
        { id: "settings" as const, label: "General", icon: Settings },
        { id: "folders" as const, label: "Search Index", icon: FolderOpen },
        { id: "bangs" as const, label: "Quick Bangs", icon: Hash },
        { id: "about" as const, label: "About", icon: Info }
    ];

    return (
        <div className="flex w-full h-full text-white/80">
            {/* Sidebar Navigation */}
            <div className="w-60 border-r border-white/5 flex flex-col py-8 px-4 gap-1">
                <div className="px-3 mb-8">
                    <h1 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/20">Settings</h1>
                </div>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                                activeSection === item.id
                                    ? "bg-white/8 text-white/90"
                                    : "text-white/30 hover:bg-white/5 hover:text-white/60"
                            }`}
                        >
                            <Icon size={16} />
                            <span className="text-[13px] font-medium">{item.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1 max-h-[90vh]">
                    <div className="max-w-3xl mx-auto py-12 px-10">
                        {activeSection === "settings" && (
                            <GeneralSettingsSection
                                listeningToKeyboard={listeningToKeyboard}
                                setListeningToKeyboard={setListeningToKeyboard}
                                openBind={openBind}
                                bindLoad={bindLoad}
                                currentOpenBind={currentOpenBind}
                                confirmChangeBind={confirmChangeBind}
                                openOnStartup={openOnStartup}
                                toggleOpenOnStartup={toggleOpenOnStartup}
                            />
                        )}

                        {activeSection === "folders" && (
                            <FoldersSection
                                cachedFolders={cachedFolders}
                                loadingCachedFolders={loadingCachedFolders}
                                removingFolder={removingFolder}
                                onAddFolder={onAddFolder}
                                deleteFolder={deleteFolder}
                            />
                        )}

                        {activeSection === "bangs" && <QuickBangsSection />}

                        {activeSection === "about" && <AboutSection />}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}