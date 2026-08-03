import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Square, History, Plus, Trash2, ArrowUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useChat } from "@/ai/useChat.ts";
import logo from "@/assets/icon.png";

/**
 * AI lives inside the launcher, not a second window — same 800x550 frame, same
 * footer. Space is tight, so chat history is a hover popover rather than a
 * permanent sidebar, and the controls sit on one compact strip.
 */
export default function AiPage() {
    const [prompt, setPrompt] = useState("");
    const { chat, streaming, partial, error, send, cancel, openChat, newChat } = useChat();
    const [searchParams, setSearchParams] = useSearchParams();

    const [providers, setProviders] = useState<AiProviderInfo[]>([]);
    const [providerId, setProviderId] = useState("");
    const [model, setModel] = useState("");
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [chats, setChats] = useState<AiChatSummary[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const seededRef = useRef(false);

    const provider = useMemo(
        () => providers.find(p => p.id === providerId) ?? null,
        [providers, providerId],
    );

    const refreshChats = useCallback(async () => {
        setChats(await window.ai.listChats());
    }, []);

    useEffect(() => {
        (async () => {
            const list = await window.ai.listProviders();
            setProviders(list);
            const first = list.find(p => p.available) ?? list[0];
            if (first) {
                setProviderId(first.id);
                setModel(first.models[0]?.id ?? "");
                setSettings(Object.fromEntries(first.controls.map(c => [c.id, c.default])));
            }
            await refreshChats();
        })();
    }, [refreshChats]);

    // Reload the history list whenever the active chat is written to. Guarded so
    // a slow read can't set state after the view has been left.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await window.ai.listChats();
            if (!cancelled) setChats(list);
        })();
        return () => { cancelled = true; };
    }, [chat?.updatedAt]);

    // Hold the launcher open while this view is mounted — clicking away mid
    // answer must not dismiss the window and lose the stream.
    useEffect(() => {
        window.ai.setMode(true);
        return () => window.ai.setMode(false);
    }, []);

    const submit = useCallback((text: string) => {
        if (!providerId || !text.trim() || streaming) return;
        send(text, { providerId, model: model || undefined, settings });
        setPrompt("");
    }, [providerId, streaming, send, model, settings]);

    // Arrived from the launcher's "Ask AI" row with a question already typed.
    useEffect(() => {
        const seed = searchParams.get("prompt");
        if (!seed || seededRef.current || !providerId) return;
        seededRef.current = true;
        submit(seed);
        setSearchParams({}, { replace: true });
    }, [searchParams, providerId, submit, setSearchParams]);

    // Follow the stream, but don't yank the view down if you've scrolled up.
    useEffect(() => {
        const viewport = scrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
        if (!viewport) return;
        const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
        if (nearBottom) viewport.scrollTop = viewport.scrollHeight;
    }, [chat?.messages.length, partial]);

    const messages = chat?.messages ?? [];
    const empty = messages.length === 0;

    return (
        // Centred while empty, docked once a conversation starts. The prompt box
        // keeps the same slot in this children array across both states, so the
        // textarea node survives the switch and doesn't lose focus mid-thought.
        <div className={`flex-1 min-h-0 flex flex-col ${empty ? "justify-center" : ""}`}>
            {empty ? (
                <div className="flex flex-col items-center gap-2.5 pb-5">
                    <img src={logo} alt="" className="w-9 h-9 object-contain opacity-70" />
                    <p className="text-[12px] text-white/35">Ask anything</p>
                    {provider && !provider.available && (
                        <p className="text-[10px] text-amber-300/60 text-center max-w-xs">
                            {provider.detail}
                        </p>
                    )}
                </div>
            ) : (
                <ScrollArea ref={scrollRef} className="flex-1 min-h-0 w-full px-5">
                    <div className="flex flex-col gap-3.5 py-4">
                        {messages.map((m, i) => {
                            const isLast = i === messages.length - 1;
                            const live = isLast && m.role === "assistant" && streaming;
                            const body = live ? partial : m.content;

                            if (m.role === "user") {
                                return (
                                    <div
                                        key={i}
                                        className="self-end max-w-[76%] rounded-2xl rounded-br-md bg-white/[0.07] border border-white/[0.06] px-3.5 py-2 text-[12.5px] leading-relaxed text-white/85 whitespace-pre-wrap break-words"
                                    >
                                        {m.content}
                                    </div>
                                );
                            }

                            return (
                                <div key={i} className="self-start flex gap-2.5 max-w-[88%]">
                                    <img src={logo} alt="" className="w-4 h-4 mt-0.5 shrink-0 object-contain opacity-50" />
                                    <div className="text-[12.5px] leading-relaxed text-white/75 whitespace-pre-wrap break-words">
                                        {body}
                                        {live && (
                                            <span className="inline-block w-[7px] h-[13px] ml-0.5 -mb-0.5 rounded-[1px] bg-white/40 animate-pulse" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {error && (
                        <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-red-400/[0.08] border border-red-400/20">
                            <p className="text-[10.5px] text-red-300/80">{error}</p>
                        </div>
                    )}
                </ScrollArea>
            )}

            {/* Its own prompt box — the launcher's search input stays out of
                the way while this view is open. */}
            <div className={`shrink-0 px-5 ${empty ? "" : "pb-3"}`}>
                <div className={`mx-auto w-full rounded-2xl border border-white/[0.08] bg-white/[0.045] backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.25)] focus-within:border-white/[0.16] focus-within:bg-white/[0.06] transition-colors ${empty ? "max-w-[560px]" : ""}`}>
                    <textarea
                        ref={inputRef}
                        value={prompt}
                        autoFocus
                        rows={2}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submit(prompt);
                            }
                            // Escape falls through to the launcher's global
                            // handler, which routes back to the search view.
                        }}
                        placeholder="Ask anything…"
                        className="w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-[12.5px] leading-relaxed text-white/85 placeholder:text-white/25 outline-none"
                    />

                    <div className="flex items-center gap-1.5 px-2.5 pb-2">
                        <Selector
                            value={providerId}
                            onChange={(id) => {
                                setProviderId(id);
                                const p = providers.find(x => x.id === id);
                                setModel(p?.models[0]?.id ?? "");
                                setSettings(Object.fromEntries((p?.controls ?? []).map(c => [c.id, c.default])));
                            }}
                            options={providers.map(p => ({
                                id: p.id,
                                label: p.available ? p.label : `${p.label} (unavailable)`,
                            }))}
                        />
                        {provider && provider.models.length > 0 && (
                            <Selector value={model} onChange={setModel}
                                      options={provider.models.map(m => ({ id: m.id, label: m.label }))} />
                        )}
                        {/* Only knobs this provider honours */}
                        {provider?.controls.map(control => (
                            <Selector
                                key={control.id}
                                value={settings[control.id] ?? control.default}
                                onChange={(v) => setSettings(s => ({ ...s, [control.id]: v }))}
                                options={control.options.map(o => ({ id: o.id, label: o.label }))}
                            />
                        ))}

                        <div className="ml-auto flex items-center gap-1">
                            {streaming && (
                                <button
                                    onClick={cancel}
                                    title="Stop"
                                    className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer"
                                >
                                    <Square size={9} /> Stop
                                </button>
                            )}

                            <button
                                onClick={newChat}
                                title="New chat"
                                className="p-1 rounded-md text-white/35 hover:text-white/75 hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                                <Plus size={12} />
                            </button>

                            <ChatHistory
                                chats={chats}
                                activeId={chat?.id ?? null}
                                onOpen={openChat}
                                onDelete={async (id) => {
                                    await window.ai.deleteChat(id);
                                    if (chat?.id === id) newChat();
                                    refreshChats();
                                }}
                            />

                            <button
                                onClick={() => submit(prompt)}
                                disabled={!prompt.trim() || streaming}
                                title="Send"
                                className="flex items-center justify-center w-6 h-6 rounded-md bg-white/[0.12] hover:bg-white/[0.2] disabled:opacity-25 disabled:cursor-default transition-colors cursor-pointer"
                            >
                                <ArrowUp size={12} className="text-white/80" />
                            </button>
                        </div>
                    </div>
                </div>

                {empty && error && (
                    <p className="mx-auto max-w-[560px] mt-2 text-[10.5px] text-red-300/80">{error}</p>
                )}
            </div>
        </div>
    );
}

/** Hover-revealed, because a permanent list would eat the transcript's space. */
function ChatHistory({ chats, activeId, onOpen, onDelete }: {
    chats: AiChatSummary[];
    activeId: string | null;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <button
                title="Recent chats"
                className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] text-white/35 hover:text-white/75 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
                <History size={12} />
            </button>

            {open && (
                <div className="absolute bottom-full right-0 mb-1 w-60 max-h-52 overflow-y-auto rounded-lg border border-white/[0.09] bg-[rgba(18,18,20,0.97)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.45)] py-1 z-50">
                    {chats.length === 0 ? (
                        <p className="px-3 py-2 text-[10.5px] text-white/25">No conversations yet</p>
                    ) : chats.map(c => (
                        <div
                            key={c.id}
                            className={`group flex items-center gap-1 mx-1 rounded-md transition-colors ${
                                activeId === c.id ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                            }`}
                        >
                            <button
                                onClick={() => { onOpen(c.id); setOpen(false); }}
                                className="flex-1 min-w-0 text-left px-2 py-1.5 cursor-pointer"
                            >
                                <span className="block truncate text-[11px] text-white/70">{c.title}</span>
                            </button>
                            <button
                                onClick={() => onDelete(c.id)}
                                aria-label={`Delete ${c.title}`}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 mr-1 rounded text-white/30 hover:text-red-300/80 cursor-pointer"
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Selector({ value, onChange, options }: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ id: string; label: string }>;
}) {
    if (options.length === 0) return null;
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-md px-1.5 py-1 text-[10px] text-white/55 outline-none hover:bg-white/[0.08] transition-colors cursor-pointer max-w-[140px]"
        >
            {options.map(o => (
                <option key={o.id} value={o.id} className="bg-[#141416] text-white/80">{o.label}</option>
            ))}
        </select>
    );
}
