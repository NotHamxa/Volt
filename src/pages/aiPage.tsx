import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Square, PanelLeft, Plus, Trash2, ArrowUp, MessageCircle, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
    InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea,
} from "@/components/ui/input-group.tsx";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { useChat } from "@/ai/useChat.ts";
import { Markdown } from "@/ai/markdown.tsx";
import { CopyButton } from "@/ai/copyButton.tsx";
import logo from "@/assets/icon.png";

/**
 * Which knobs apply to a given model. Providers whose controls are uniform
 * declare them once; Claude declares them per model, because the levels each
 * one accepts genuinely differ.
 */
function controlsFor(provider: AiProviderInfo | null | undefined, modelId: string): AiControl[] {
    if (!provider) return [];
    return provider.models.find(m => m.id === modelId)?.controls ?? provider.controls;
}

/**
 * AI lives inside the launcher, not a second window — same 800x550 frame, same
 * footer. Built on the same primitives shadcn's AI chat components use
 * (input-group for the prompt, select for the toolbar dropdowns), so it
 * inherits their keyboard and focus behaviour rather than re-implementing it
 * with bare elements.
 */
export default function AiPage() {
    const [prompt, setPrompt] = useState("");
    const { chat, streaming, partial, error, send, rerun, cancel, openChat, newChat } = useChat();
    const [searchParams, setSearchParams] = useSearchParams();

    const [providers, setProviders] = useState<AiProviderInfo[]>([]);
    const [providerId, setProviderId] = useState("");
    const [model, setModel] = useState("");
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [chats, setChats] = useState<AiChatSummary[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const seededRef = useRef(false);
    const lastChatIdRef = useRef<string | null>(null);

    const provider = useMemo(
        () => providers.find(p => p.id === providerId) ?? null,
        [providers, providerId],
    );

    // A model can narrow its provider's knobs — Claude's Haiku takes no effort
    // level at all — so the model's own list wins when it declares one.
    const controls = useMemo(() => controlsFor(provider, model), [provider, model]);

    const refreshChats = useCallback(async () => {
        setChats(await window.ai.listChats());
    }, []);

    useEffect(() => {
        (async () => {
            const [list, prefs] = await Promise.all([
                window.ai.listProviders(),
                window.ai.getPrefs(),
            ]);
            setProviders(list);

            // Settings pick the starting point; fall back to whatever is usable
            // if the saved provider has since disappeared.
            const chosen = list.find(p => p.id === prefs.providerId)
                ?? list.find(p => p.available)
                ?? list[0];
            if (chosen) {
                setProviderId(chosen.id);
                const savedModel = chosen.models.some(m => m.id === prefs.model) ? prefs.model : null;
                const modelId = savedModel ?? chosen.models[0]?.id ?? "";
                setModel(modelId);
                const saved = prefs.settings[chosen.id] ?? {};
                setSettings(Object.fromEntries(
                    controlsFor(chosen, modelId).map(c => [c.id, saved[c.id] ?? c.default]),
                ));
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

    /**
     * A conversation remembers its own setup. Changing provider or model is a
     * deliberate choice for *this* thread, so it's written to the chat rather
     * than to the global defaults — reopening it lands you back where you were.
     */
    const applyConfig = useCallback((patch: {
        providerId?: string;
        model?: string;
        settings?: Record<string, string>;
    }) => {
        if (patch.providerId !== undefined) setProviderId(patch.providerId);
        if (patch.model !== undefined) setModel(patch.model);
        if (patch.settings !== undefined) setSettings(patch.settings);
        const activeId = chat?.id;
        if (activeId) window.ai.updateChatConfig(activeId, patch);
    }, [chat?.id]);

    // Opening a stored chat restores the provider, model and controls it was
    // last used with. Guarded against a provider that has since gone away.
    const openStoredChat = useCallback(async (id: string) => {
        const loaded = await openChat(id);
        if (!loaded) return;
        const provider = providers.find(p => p.id === loaded.providerId);
        if (!provider) return;
        setProviderId(provider.id);
        const modelId = provider.models.some(m => m.id === loaded.model)
            ? loaded.model!
            : provider.models[0]?.id ?? "";
        setModel(modelId);
        const stored = loaded.settings ?? {};
        setSettings(Object.fromEntries(
            controlsFor(provider, modelId).map(c => [c.id, stored[c.id] ?? c.default]),
        ));
    }, [openChat, providers]);

    // Arrived from the launcher's "Ask AI" row with a question already typed.
    useEffect(() => {
        const seed = searchParams.get("prompt");
        if (!seed || seededRef.current || !providerId) return;
        seededRef.current = true;
        submit(seed);
        setSearchParams({}, { replace: true });
    }, [searchParams, providerId, submit, setSearchParams]);

    // Follow the stream, but don't yank the view down if you've scrolled up.
    // Opening a different conversation is the exception: a reopened chat should
    // start at its newest message, and the near-bottom test can't tell that
    // apart from a deliberate scroll-up because a fresh viewport sits at 0.
    // Layout effect, so the jump happens before the top is ever painted.
    useLayoutEffect(() => {
        const viewport = scrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
        if (!viewport) return;

        const switched = chat?.id !== lastChatIdRef.current;
        lastChatIdRef.current = chat?.id ?? null;

        if (switched) {
            viewport.scrollTop = viewport.scrollHeight;
            // Radix measures the viewport asynchronously, so re-apply once the
            // first frame has settled and the real height is known.
            const frame = requestAnimationFrame(() => {
                viewport.scrollTop = viewport.scrollHeight;
            });
            return () => cancelAnimationFrame(frame);
        }

        const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
        if (nearBottom) viewport.scrollTop = viewport.scrollHeight;
    }, [chat?.id, chat?.messages.length, partial]);

    const messages = chat?.messages ?? [];
    const empty = messages.length === 0;

    return (
        <div className="relative flex-1 min-h-0 flex">
            <ChatSidebar
                chats={chats}
                activeId={chat?.id ?? null}
                onOpen={(id) => { openStoredChat(id); inputRef.current?.focus(); }}
                onNew={() => { newChat(); inputRef.current?.focus(); }}
                onDelete={async (id) => {
                    await window.ai.deleteChat(id);
                    if (chat?.id === id) newChat();
                    refreshChats();
                }}
            />

            {/* Centred while empty, docked once a conversation starts. The prompt
                box keeps the same slot in this children array across both states,
                so the textarea node survives the switch and keeps focus. */}
            <div className={`relative flex-1 min-w-0 flex flex-col ${empty ? "justify-center" : ""}`}>
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
                    <ScrollArea ref={scrollRef} className="flex-1 min-h-0 w-full px-4">
                        {/* Bottom padding clears the floating prompt box, so the
                            last message can still be read — and earlier ones
                            slide under the glass rather than stopping at it. */}
                        <div className="flex flex-col gap-3.5 pt-4 pb-28">
                            {messages.map((m, i) => {
                                const isLast = i === messages.length - 1;
                                const live = isLast && m.role === "assistant" && streaming;

                                if (m.role === "user") {
                                    return (
                                        <div key={i} className="group/msg self-end flex items-start gap-1 max-w-[82%]">
                                            <div className="opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity mt-1">
                                                <CopyButton getText={() => m.content} label="Copy message" />
                                            </div>
                                            <div className="rounded-2xl rounded-br-md bg-white/[0.07] border border-white/[0.06] px-3.5 py-2 text-[12.5px] leading-relaxed text-white/85 whitespace-pre-wrap break-words">
                                                {m.content}
                                            </div>
                                        </div>
                                    );
                                }

                                const body = live ? partial : m.content;
                                return (
                                    // min-w-0 so a wide table scrolls inside its
                                    // own box instead of stretching the row.
                                    <div key={i} className="group/msg self-start flex gap-2.5 w-full min-w-0">
                                        <img src={logo} alt="" className="w-4 h-4 mt-0.5 shrink-0 object-contain opacity-50" />
                                        {live && !body ? (
                                            <span className="flex items-center gap-1.5 text-[11.5px] text-white/35">
                                                <Spinner className="size-3" /> Thinking…
                                            </span>
                                        ) : (
                                            <div className="min-w-0 flex-1">
                                                <Markdown>{body}</Markdown>
                                                {live && (
                                                    <span className="inline-block w-[7px] h-[13px] -mt-0.5 rounded-[1px] bg-white/40 animate-pulse" />
                                                )}
                                                {/* Actions stay hidden until the
                                                    message is hovered, so a quiet
                                                    transcript stays quiet. */}
                                                {!live && body && (
                                                    <div className="flex items-center gap-0.5 mt-1 -ml-1 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
                                                        <CopyButton getText={() => body} label="Copy message" />
                                                        {isLast && !streaming && (
                                                            <button
                                                                onClick={() => rerun({ providerId, model: model || undefined, settings })}
                                                                aria-label="Ask again"
                                                                title="Ask again"
                                                                className="flex items-center justify-center w-6 h-6 rounded-md text-white/35 hover:text-white/80 transition-colors cursor-pointer"
                                                            >
                                                                <RotateCcw size={11} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
                {/* Floats over the transcript once a conversation starts, so the
                    frosted panel has something moving behind it to blur. */}
                <div className={empty ? "shrink-0 px-4 pr-5" : "absolute inset-x-0 bottom-3 z-30 px-4 pr-5"}>
                    <TooltipProvider delayDuration={300}>
                        <InputGroup
                            className={`mx-auto w-full rounded-2xl border-white/[0.09] bg-[rgba(22,22,26,0.6)] dark:bg-[rgba(22,22,26,0.6)] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_6px_26px_rgba(0,0,0,0.4)] transition-colors focus-within:border-white/[0.18] has-[[data-slot=input-group-control]:focus-visible]:ring-0 ${empty ? "max-w-[560px]" : ""}`}
                        >
                            <InputGroupTextarea
                                ref={inputRef}
                                value={prompt}
                                autoFocus
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
                                // field-sizing grows the box with the text instead
                                // of scrolling inside a fixed two rows.
                                className="field-sizing-content scrollbar-thin-shadcn min-h-[46px] max-h-32 px-3.5 pt-3 pb-1 text-[12.5px] leading-relaxed text-white/85 placeholder:text-white/25"
                            />

                            <InputGroupAddon align="block-end" className="gap-1 border-t border-white/[0.05] px-2.5">
                                <ControlSelect
                                    value={providerId}
                                    onChange={(id) => {
                                        const p = providers.find(x => x.id === id);
                                        const first = p?.models[0]?.id ?? "";
                                        applyConfig({
                                            providerId: id,
                                            model: first,
                                            settings: Object.fromEntries(
                                                controlsFor(p, first).map(c => [c.id, c.default]),
                                            ),
                                        });
                                    }}
                                    options={providers.map(p => ({
                                        id: p.id,
                                        label: p.available ? p.label : `${p.label} (unavailable)`,
                                    }))}
                                />
                                {provider && provider.models.length > 0 && (
                                    <ControlSelect
                                        value={model}
                                        onChange={(m) => applyConfig({
                                            model: m,
                                            // The new model may offer different
                                            // levels, or none at all.
                                            settings: Object.fromEntries(
                                                controlsFor(provider, m).map(c => [c.id, settings[c.id] ?? c.default]),
                                            ),
                                        })}
                                        options={provider.models.map(m => ({ id: m.id, label: m.label }))}
                                    />
                                )}
                                {/* Only knobs this provider honours */}
                                {controls.map(control => (
                                    <ControlSelect
                                        key={control.id}
                                        value={settings[control.id] ?? control.default}
                                        onChange={(v) => applyConfig({ settings: { ...settings, [control.id]: v } })}
                                        options={control.options.map(o => ({ id: o.id, label: o.label }))}
                                    />
                                ))}

                                {/* One button for both states, the way shadcn's
                                    prompt input does it — the stop target is
                                    exactly where you just clicked send. */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <InputGroupButton
                                            size="icon-xs"
                                            variant="default"
                                            onClick={() => (streaming ? cancel() : submit(prompt))}
                                            disabled={!streaming && !prompt.trim()}
                                            aria-label={streaming ? "Stop" : "Send"}
                                            className="ml-auto rounded-full bg-white/[0.14] text-white/85 hover:bg-white/[0.22] disabled:opacity-25"
                                        >
                                            {streaming ? <Square className="fill-current" /> : <ArrowUp />}
                                        </InputGroupButton>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="top"
                                        className="flex items-center gap-1.5 border border-white/10 bg-[rgba(20,20,22,0.98)] px-2 py-1 text-[11px] text-white/70"
                                    >
                                        {streaming ? "Stop" : <>Send <Kbd className="bg-white/10 text-white/55">Enter</Kbd></>}
                                    </TooltipContent>
                                </Tooltip>
                            </InputGroupAddon>
                        </InputGroup>
                    </TooltipProvider>

                    {empty && error && (
                        <p className="mx-auto max-w-[560px] mt-2 text-[10.5px] text-red-300/80">{error}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * A collapsed rail that expands into a panel, the way Claude's sidebar works.
 * A hover popover was the wrong shape here: it dismissed the moment the pointer
 * left the trigger, so a conversation could never actually be clicked. Closing
 * is deferred instead, and clicking the rail pins the panel open.
 */
function ChatSidebar({ chats, activeId, onOpen, onNew, onDelete }: {
    chats: AiChatSummary[];
    activeId: string | null;
    onOpen: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}) {
    const [hovering, setHovering] = useState(false);
    const [pinned, setPinned] = useState(false);
    const closeTimer = useRef<NodeJS.Timeout | null>(null);
    const open = hovering || pinned;

    // The panel overlaps the rail, so crossing between them fires a leave then
    // an enter. Deferring the close lets the enter cancel it.
    const openNow = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setHovering(true);
    };
    const closeSoon = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setHovering(false), 180);
    };
    useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

    return (
        <>
            <div
                className="w-9 shrink-0 flex flex-col items-center pt-2.5"
                onMouseEnter={openNow}
                onMouseLeave={closeSoon}
            >
                <button
                    onClick={() => setPinned(p => !p)}
                    aria-label="Conversations"
                    aria-expanded={open}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                        open ? "text-white/70 bg-white/[0.07]" : "text-white/30 hover:text-white/70 hover:bg-white/[0.06]"
                    }`}
                >
                    <PanelLeft size={14} />
                </button>
            </div>

            {open && (
                <div
                    onMouseEnter={openNow}
                    onMouseLeave={closeSoon}
                    className="absolute left-0 top-0 bottom-0 z-40 w-56 flex flex-col rounded-r-xl border-r border-white/[0.08] bg-[rgba(18,18,20,0.98)] backdrop-blur-xl shadow-[8px_0_28px_rgba(0,0,0,0.45)] animate-in fade-in slide-in-from-left-2 duration-150"
                >
                    <div className="flex items-center justify-between px-2 pt-2.5 pb-1.5">
                        <button
                            onClick={() => setPinned(p => !p)}
                            aria-label="Conversations"
                            className="p-1.5 rounded-md text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                            <PanelLeft size={14} />
                        </button>
                        {pinned && <span className="text-[9px] uppercase tracking-wide text-white/20 pr-1">Pinned</span>}
                    </div>

                    <button
                        onClick={onNew}
                        className="mx-2 flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[12px] text-white/75 hover:bg-white/[0.07] transition-colors cursor-pointer"
                    >
                        <Plus size={14} className="text-white/45" />
                        New chat
                    </button>

                    <p className="px-4 pt-3 pb-1 text-[10px] text-white/25">Recents</p>

                    <ScrollArea className="flex-1 min-h-0 px-2 pb-2">
                        {chats.length === 0 ? (
                            <p className="px-2 py-1.5 text-[11px] text-white/20">No conversations yet</p>
                        ) : chats.map(c => (
                            <div
                                key={c.id}
                                className={`group flex items-center rounded-lg transition-colors ${
                                    activeId === c.id ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
                                }`}
                            >
                                <button
                                    onClick={() => onOpen(c.id)}
                                    className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 cursor-pointer"
                                >
                                    <MessageCircle size={13} className="shrink-0 text-white/30" />
                                    <span className="block truncate text-left text-[11.5px] text-white/70">{c.title}</span>
                                </button>
                                <button
                                    onClick={() => onDelete(c.id)}
                                    aria-label={`Delete ${c.title}`}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 mr-1 rounded text-white/30 hover:text-red-300/80 cursor-pointer"
                                >
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        ))}
                    </ScrollArea>
                </div>
            )}
        </>
    );
}

/**
 * Toolbar dropdown: a real listbox rather than a native <select>, so the popup
 * is themed with the rest of the app instead of being drawn by Windows.
 */
function ControlSelect({ value, onChange, options }: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ id: string; label: string }>;
}) {
    if (options.length === 0) return null;
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger
                size="sm"
                className="data-[size=sm]:h-6 w-fit max-w-[150px] gap-1 rounded-md border-none bg-transparent px-1.5 text-[10.5px] font-medium text-white/45 shadow-none hover:bg-white/[0.07] hover:text-white/80 focus-visible:ring-0 aria-expanded:bg-white/[0.07] aria-expanded:text-white/80 dark:bg-transparent dark:hover:bg-white/[0.07] [&_svg]:size-3 [&_svg:not([class*='text-'])]:text-white/30"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent
                position="popper"
                className="min-w-[9rem] rounded-lg border-white/[0.09] bg-[rgba(18,18,20,0.97)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            >
                {options.map(o => (
                    <SelectItem
                        key={o.id}
                        value={o.id}
                        className="text-[11px] text-white/65 focus:bg-white/[0.07] focus:text-white/90 [&_svg]:size-3"
                    >
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
