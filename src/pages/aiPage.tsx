import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
    Square, PanelLeft, Plus, Trash2, ArrowUp, ArrowDown, MessageCircle, RotateCcw, Pencil, Check,
} from "lucide-react";
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
import { useSmoothText } from "@/ai/useSmoothText.ts";
import { ModelPicker } from "@/ai/modelPicker.tsx";
import { Markdown, StreamingMarkdown } from "@/ai/markdown.tsx";
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
    const { chat, streaming, stopping, partial, error, send, rerun, cancel, openChat, newChat } = useChat();
    const [searchParams, setSearchParams] = useSearchParams();

    const [providers, setProviders] = useState<AiProviderInfo[]>([]);
    const [providerId, setProviderId] = useState("");
    const [model, setModel] = useState("");
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [chats, setChats] = useState<AiChatSummary[]>([]);
    const [customModels, setCustomModels] = useState<Record<string, string[]>>({});
    const [running, setRunning] = useState<string[]>([]);
    // Following the newest message. Set from real intent, never inferred
    // from a position we ourselves just wrote.
    const [following, setFollowing] = useState(true);

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

    // Providers deliver in slabs, not tokens; this paces the reveal so the
    // answer reads as it is written.
    // `stopping` settles it too: once you've asked it to stop, text must not
    // carry on appearing from the buffer while the provider winds down.
    const revealed = useSmoothText(partial, !streaming || stopping);

    // Declared before the hooks below, which use them as dependencies. A `const`
    // is in its temporal dead zone until this line runs, so leaving these at the
    // foot of the component threw on every render of this view.
    const messages = chat?.messages ?? [];
    const empty = messages.length === 0;

    /**
     * Models for one provider, fetched on demand and merged in.
     *
     * The provider list arrives without catalogues: reading them costs a CLI
     * spawn each, and waiting on all of them held the toolbar empty for about
     * two seconds. Only the provider actually in use is paid for.
     */
    const loadingModels = useRef(new Set<string>());
    const ensureModels = useCallback(async (id: string) => {
        if (!id || loadingModels.current.has(id)) return;
        loadingModels.current.add(id);
        const models = await window.ai.providerModels(id);
        setProviders(list => list.map(p => (p.id === id ? { ...p, models } : p)));
    }, []);

    /** Remembering a hand-typed id is the only way an unadvertised model can
     *  join the list, so it is persisted rather than kept for the session. */
    const rememberModel = useCallback((id: string, modelId: string) => {
        setCustomModels(current => {
            const existing = current[id] ?? [];
            if (existing.includes(modelId)) return current;
            const next = { ...current, [id]: [...existing, modelId] };
            window.ai.setPrefs({ customModels: next });
            return next;
        });
    }, []);

    const forgetModel = useCallback((id: string, modelId: string) => {
        setCustomModels(current => {
            const next = { ...current, [id]: (current[id] ?? []).filter(m => m !== modelId) };
            window.ai.setPrefs({ customModels: next });
            return next;
        });
    }, []);

    const refreshChats = useCallback(async () => {
        const [list, active] = await Promise.all([
            window.ai.listChats(),
            window.ai.activeTurns(),
        ]);
        setChats(list);
        setRunning(active);
    }, []);

    // Turns finish in conversations that aren't open, so the list is refreshed
    // on any turn ending rather than only on the active chat changing.
    useEffect(() => {
        const detach = window.ai.onChunk((chunk) => {
            if (chunk.type === "done") refreshChats();
        });
        return detach;
    }, [refreshChats]);

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
                // The saved id is enough to label the control immediately; the
                // catalogue only matters once the picker is opened.
                setModel(prefs.model ?? "");
                setSettings(prefs.settings[chosen.id] ?? {});
                ensureModels(chosen.id);
            }
            setCustomModels(prefs.customModels ?? {});
            await refreshChats();
        })();
    }, [refreshChats, ensureModels]);

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

    // Ctrl+N starts a fresh conversation. A running turn is left alone: it is
    // owned by the main process and still writes its answer to its own chat.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey || e.key.toLowerCase() !== "n") return;
            e.preventDefault();
            newChat();
            setFollowing(true);
            setPrompt("");
            inputRef.current?.focus();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [newChat]);

    const submit = useCallback((text: string) => {
        if (!providerId || !text.trim() || streaming) return;
        // Sending is an explicit request to see what comes back, so re-follow
        // the bottom even if you had scrolled away to re-read something.
        setFollowing(true);
        send(text, { providerId, model: model || undefined, settings })
            .then(refreshChats);
        setPrompt("");
    }, [providerId, streaming, send, model, settings, refreshChats]);

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
        setFollowing(true);
        setProviderId(provider.id);
        setModel(loaded.model ?? "");
        setSettings(loaded.settings ?? {});
        ensureModels(provider.id);
    }, [openChat, providers, ensureModels]);

    // Arrived from the launcher's "Ask AI" row with a question already typed.
    useEffect(() => {
        const seed = searchParams.get("prompt");
        if (!seed || seededRef.current || !providerId) return;
        seededRef.current = true;
        submit(seed);
        setSearchParams({}, { replace: true });
    }, [searchParams, providerId, submit, setSearchParams]);

    /**
     * Whether the view is following the bottom.
     *
     * Scroll events are dispatched asynchronously, but a live answer rewrites
     * scrollTop every frame — so a wheel-up was undone by the next frame before
     * its own event could unstick it, and the event then read "at bottom" and
     * kept following. That is the fighting.
     *
     * Two signals instead of one: a wheel or key press upward is unambiguous
     * intent and unsticks immediately, and scroll positions are only trusted
     * when they came from you rather than from us. Reaching the bottom again
     * resumes following.
     */
    const programmaticRef = useRef(false);

    /** Scrolls without the result being mistaken for the reader's own doing. */
    const scrollToBottom = useCallback((viewport: HTMLElement) => {
        if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 1) return;
        programmaticRef.current = true;
        viewport.scrollTop = viewport.scrollHeight;
        // Cleared on the next frame, so it holds whether the scroll event
        // arrives before or after.
        requestAnimationFrame(() => { programmaticRef.current = false; });
    }, []);

    useEffect(() => {
        const viewport = scrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
        if (!viewport) return;

        const onScroll = () => {
            // Our own correction, not a decision by the reader.
            if (programmaticRef.current) return;
            setFollowing(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24);
        };
        // Reading is a deliberate act; act on it before the frame can undo it.
        const onWheel = (e: WheelEvent) => { if (e.deltaY < 0) setFollowing(false); };
        const onKey = (e: KeyboardEvent) => {
            if (["ArrowUp", "PageUp", "Home"].includes(e.key)) setFollowing(false);
        };

        viewport.addEventListener("scroll", onScroll, { passive: true });
        viewport.addEventListener("wheel", onWheel, { passive: true });
        viewport.addEventListener("keydown", onKey);
        return () => {
            viewport.removeEventListener("scroll", onScroll);
            viewport.removeEventListener("wheel", onWheel);
            viewport.removeEventListener("keydown", onKey);
        };
    }, [empty]);

    const jumpToLatest = useCallback(() => {
        const viewport = scrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
        setFollowing(true);
        if (viewport) scrollToBottom(viewport);
    }, [scrollToBottom]);

    // Follow the stream while following. Layout effect, so the jump happens
    // before an out-of-place position is ever painted.
    useLayoutEffect(() => {
        const viewport = scrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
        if (!viewport || !following) return;

        scrollToBottom(viewport);

        // Radix measures the viewport asynchronously, so a freshly opened
        // conversation needs re-applying once the real height is known.
        const switched = chat?.id !== lastChatIdRef.current;
        lastChatIdRef.current = chat?.id ?? null;
        if (!switched) return;
        const frame = requestAnimationFrame(() => scrollToBottom(viewport));
        return () => cancelAnimationFrame(frame);
        // updatedAt covers a message's content changing without the count
        // changing — committing a streamed answer over its placeholder.
    }, [chat?.id, chat?.messages.length, chat?.updatedAt, revealed, following, scrollToBottom]);


    return (
        <div className="relative flex-1 min-h-0 flex">
            <ChatSidebar
                chats={chats}
                activeId={chat?.id ?? null}
                running={running}
                onOpen={(id) => { openStoredChat(id); inputRef.current?.focus(); }}
                onNew={() => { newChat(); setFollowing(true); inputRef.current?.focus(); }}
                onDelete={async (id) => {
                    await window.ai.deleteChat(id);
                    if (chat?.id === id) newChat();
                    refreshChats();
                }}
                onDeleteAll={async () => {
                    await window.ai.deleteAllChats();
                    newChat();
                    refreshChats();
                }}
                onRename={async (id, title) => {
                    await window.ai.renameChat(id, title);
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
                        <p className="text-[12px] text-tone-350">Ask anything</p>
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
                                            <div className="rounded-2xl rounded-br-md bg-fill-070 border border-line-060 px-3.5 py-2 text-[12.5px] leading-relaxed text-tone-850 whitespace-pre-wrap break-words">
                                                {m.content}
                                            </div>
                                        </div>
                                    );
                                }

                                const body = live ? revealed : m.content;
                                return (
                                    // min-w-0 so a wide table scrolls inside its
                                    // own box instead of stretching the row.
                                    <div key={i} className="group/msg self-start flex gap-2.5 w-full min-w-0">
                                        <img src={logo} alt="" className="w-4 h-4 mt-0.5 shrink-0 object-contain opacity-50" />
                                        {live && !body ? (
                                            <span className="flex items-center gap-1.5 text-[11.5px] text-tone-350">
                                                <Spinner className="size-3" /> Thinking…
                                            </span>
                                        ) : (
                                            <div className="min-w-0 flex-1">
                                                {/* While streaming, only the block
                                                    being written is re-parsed. */}
                                                {live
                                                    ? <StreamingMarkdown>{body}</StreamingMarkdown>
                                                    : <Markdown>{body}</Markdown>}
                                                {live && (
                                                    <span className="inline-block w-[7px] h-[13px] -mt-0.5 rounded-[1px] bg-ink/40 animate-pulse" />
                                                )}
                                                {/* Actions stay hidden until the
                                                    message is hovered, so a quiet
                                                    transcript stays quiet. */}
                                                {!live && body && (
                                                    <div className="flex items-center gap-0.5 mt-1 -ml-1 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
                                                        <CopyButton getText={() => body} label="Copy message" />
                                                        {isLast && !streaming && (
                                                            <button
                                                                onClick={() => {
                                                                    setFollowing(true);
                                                                    rerun({ providerId, model: model || undefined, settings });
                                                                }}
                                                                aria-label="Ask again"
                                                                title="Ask again"
                                                                className="flex items-center justify-center w-6 h-6 rounded-md text-tone-350 hover:text-tone-800 transition-colors cursor-pointer"
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
                {/* Offered while the reader has scrolled away, so following can
                    be resumed without hunting for the bottom by hand. */}
                {!empty && !following && (
                    <button
                        onClick={jumpToLatest}
                        className="absolute left-1/2 -translate-x-1/2 bottom-[104px] z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line-100 bg-surface-float/[0.92] backdrop-blur-md shadow-[0_4px_14px_var(--shadow-1)] text-[10.5px] text-tone-650 hover:text-tone-900 hover:border-ink/[0.18] transition-colors cursor-pointer animate-in fade-in slide-in-from-bottom-1 duration-150"
                    >
                        <ArrowDown size={11} />
                        {streaming ? "Jump to latest" : "Jump to bottom"}
                    </button>
                )}

                {/* Floats over the transcript once a conversation starts, so the
                    frosted panel has something moving behind it to blur. */}
                <div className={empty ? "shrink-0 px-4 pr-5" : "absolute inset-x-0 bottom-3 z-30 px-4 pr-5"}>
                    <TooltipProvider delayDuration={300}>
                        <InputGroup
                            className={`mx-auto w-full rounded-2xl border-line-090 bg-surface-float/[0.6] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_6px_26px_var(--shadow-1)] transition-colors focus-within:border-ink/[0.18] has-[[data-slot=input-group-control]:focus-visible]:ring-0 ${empty ? "max-w-[560px]" : ""}`}
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
                                className="field-sizing-content scrollbar-thin-shadcn min-h-[46px] max-h-32 px-3.5 pt-3 pb-1 text-[12.5px] leading-relaxed text-tone-850 placeholder:text-tone-250"
                            />

                            <InputGroupAddon align="block-end" className="gap-1 border-t border-line-050 px-2.5">
                                {/* Provider and model in one control — the
                                    provider list is only useful next to what it
                                    offers. */}
                                <ModelPicker
                                    providers={providers}
                                    providerId={providerId}
                                    model={model}
                                    onBrowse={ensureModels}
                                    customModels={customModels}
                                    onRemember={rememberModel}
                                    onForget={forgetModel}
                                    onSelect={(nextProvider, nextModel) => {
                                        const p = providers.find(x => x.id === nextProvider);
                                        applyConfig({
                                            providerId: nextProvider,
                                            model: nextModel,
                                            // A different model may offer other
                                            // levels, or none at all.
                                            settings: Object.fromEntries(
                                                controlsFor(p, nextModel).map(c => [c.id, settings[c.id] ?? c.default]),
                                            ),
                                        });
                                    }}
                                />

                                {/* Only knobs this provider honours */}
                                {controls.map(control => (
                                    <ControlSelect
                                        key={control.id}
                                        value={settings[control.id] ?? control.default}
                                        onChange={(v) => applyConfig({ settings: { ...settings, [control.id]: v } })}
                                        options={control.options.map(o => ({ id: o.id, label: o.label }))}
                                    />
                                ))}

                                {/* One button for all three states, the way
                                    shadcn's prompt input does it — the stop
                                    target is exactly where you clicked send.
                                    Each state looks different, so pressing stop
                                    is visibly acknowledged instead of leaving
                                    you wondering whether it registered. */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <InputGroupButton
                                            size="icon-xs"
                                            variant="default"
                                            onClick={() => (streaming ? cancel() : submit(prompt))}
                                            disabled={stopping || (!streaming && !prompt.trim())}
                                            aria-label={stopping ? "Stopping" : streaming ? "Stop" : "Send"}
                                            className={`ml-auto relative rounded-full transition-colors disabled:opacity-100 ${
                                                stopping
                                                    ? "bg-fill-060 text-tone-350"
                                                    : streaming
                                                        ? "bg-red-400/[0.16] text-red-200/90 hover:bg-red-400/[0.26]"
                                                        : "bg-fill-140 text-tone-850 hover:bg-ink/[0.22] disabled:opacity-25"
                                            }`}
                                        >
                                            {/* A ring that turns while a turn is
                                                live, so the button reads as busy
                                                rather than merely differently
                                                shaped. It stops on stopping. */}
                                            {streaming && !stopping && (
                                                <span className="absolute inset-0 rounded-full border border-red-300/40 border-t-transparent animate-spin [animation-duration:1.1s]" />
                                            )}
                                            {stopping
                                                ? <Spinner className="size-3" />
                                                : streaming
                                                    ? <Square className="fill-current size-2.5" />
                                                    : <ArrowUp />}
                                        </InputGroupButton>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="top"
                                        className="flex items-center gap-1.5 border border-line-100 bg-surface/[0.98] px-2 py-1 text-[11px] text-tone-700"
                                    >
                                        {stopping
                                            ? "Stopping…"
                                            : streaming
                                                ? "Stop generating"
                                                : <>Send <Kbd className="bg-fill-100 text-tone-550">Enter</Kbd></>}
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
function ChatSidebar({ chats, activeId, running, onOpen, onNew, onDelete, onDeleteAll, onRename }: {
    chats: AiChatSummary[];
    activeId: string | null;
    /** Conversations with a turn still in flight, including unopened ones. */
    running: string[];
    onOpen: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
    onDeleteAll: () => void;
    onRename: (id: string, title: string) => void;
}) {
    const [hovering, setHovering] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [confirmingAll, setConfirmingAll] = useState(false);
    const closeTimer = useRef<NodeJS.Timeout | null>(null);
    // An armed delete, a rename in progress or a pending clear-all keeps the
    // panel up, so the panel can't vanish out from under a half-finished action.
    const busy = confirmId !== null || renamingId !== null || confirmingAll;
    const open = hovering || pinned || busy;

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

    const commitRename = (id: string) => {
        onRename(id, draft);
        setRenamingId(null);
        setDraft("");
    };

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
                        open ? "text-tone-700 bg-fill-070" : "text-tone-300 hover:text-tone-700 hover:bg-fill-060"
                    }`}
                >
                    <PanelLeft size={14} />
                </button>
            </div>

            {open && (
                <div
                    onMouseEnter={openNow}
                    onMouseLeave={closeSoon}
                    className="absolute left-0 top-0 bottom-0 z-40 w-56 flex flex-col rounded-r-xl border-r border-line-080 bg-surface-menu/[0.98] backdrop-blur-xl shadow-[8px_0_28px_var(--shadow-2)] animate-in fade-in slide-in-from-left-2 duration-150"
                >
                    <div className="flex items-center justify-between px-2 pt-2.5 pb-1.5">
                        <button
                            onClick={() => setPinned(p => !p)}
                            aria-label="Conversations"
                            className="p-1.5 rounded-md text-tone-500 hover:text-tone-800 hover:bg-fill-060 transition-colors cursor-pointer"
                        >
                            <PanelLeft size={14} />
                        </button>
                        {pinned && <span className="text-[9px] uppercase tracking-wide text-tone-200 pr-1">Pinned</span>}
                    </div>

                    <button
                        onClick={onNew}
                        className="mx-2 flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[12px] text-tone-750 hover:bg-fill-070 transition-colors cursor-pointer"
                    >
                        <Plus size={14} className="text-tone-450" />
                        New chat
                    </button>

                    <p className="px-4 pt-3 pb-1 text-[10px] text-tone-250">Recents</p>

                    <ScrollArea className="flex-1 min-h-0 px-2 pb-2">
                        {chats.length === 0 ? (
                            <p className="px-2 py-1.5 text-[11px] text-tone-200">No conversations yet</p>
                        ) : chats.map(c => (
                            <div
                                key={c.id}
                                // Leaving the row disarms it, so a half-pressed
                                // delete can't keep the panel pinned open.
                                onMouseLeave={() => setConfirmId(id => (id === c.id ? null : id))}
                                className={`group flex items-center rounded-lg transition-colors ${
                                    activeId === c.id ? "bg-fill-080" : "hover:bg-fill-050"
                                }`}
                            >
                                {renamingId === c.id ? (
                                    <input
                                        autoFocus
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onBlur={() => commitRename(c.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); commitRename(c.id); }
                                            // Stop Escape reaching the launcher's
                                            // handler, which would leave the view.
                                            if (e.key === "Escape") {
                                                e.stopPropagation();
                                                setRenamingId(null);
                                            }
                                        }}
                                        className="flex-1 min-w-0 mx-1 my-0.5 px-1.5 py-1 rounded bg-fill-060 border border-line-120 text-[11.5px] text-tone-850 outline-none"
                                    />
                                ) : (
                                    <>
                                        <button
                                            onClick={() => onOpen(c.id)}
                                            className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 cursor-pointer"
                                        >
                                            {running.includes(c.id) ? (
                                                <span
                                                    title="Still answering"
                                                    className="relative flex w-[13px] h-[13px] shrink-0 items-center justify-center"
                                                >
                                                    <span className="absolute w-1.5 h-1.5 rounded-full bg-sky-400/70 animate-ping" />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400/80" />
                                                </span>
                                            ) : (
                                                <MessageCircle size={13} className="shrink-0 text-tone-300" />
                                            )}
                                            <span className="block truncate text-left text-[11.5px] text-tone-700">{c.title}</span>
                                        </button>
                                        {/* Both live on the row itself rather
                                            than behind a menu — one click to
                                            rename, two to delete. */}
                                        <div className={`flex items-center shrink-0 mr-1 transition-opacity ${
                                            confirmId === c.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                                        }`}>
                                            {confirmId !== c.id && (
                                                <button
                                                    onClick={() => { setDraft(c.title); setRenamingId(c.id); }}
                                                    aria-label={`Rename ${c.title}`}
                                                    title="Rename"
                                                    className="p-1 rounded text-tone-300 hover:text-tone-800 hover:bg-fill-070 transition-colors cursor-pointer"
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    // Deleting a conversation can't be undone, so the
                                                    // first click only arms the button.
                                                    if (confirmId === c.id) {
                                                        onDelete(c.id);
                                                        setConfirmId(null);
                                                    } else {
                                                        setConfirmId(c.id);
                                                    }
                                                }}
                                                aria-label={confirmId === c.id ? `Confirm delete ${c.title}` : `Delete ${c.title}`}
                                                title={confirmId === c.id ? "Click again to delete" : "Delete"}
                                                className={`p-1 rounded transition-colors cursor-pointer ${
                                                    confirmId === c.id
                                                        ? "text-red-300/90 bg-red-400/[0.14]"
                                                        : "text-tone-300 hover:text-red-300/80 hover:bg-red-400/[0.08]"
                                                }`}
                                            >
                                                {confirmId === c.id ? <Check size={11} /> : <Trash2 size={11} />}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </ScrollArea>

                    {chats.length > 0 && (
                        <div className="shrink-0 px-2 pb-2 pt-1 border-t border-line-060">
                            {confirmingAll ? (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => { onDeleteAll(); setConfirmingAll(false); }}
                                        className="flex-1 px-2 py-1.5 rounded-md text-[11px] text-red-300/85 bg-red-400/[0.1] border border-red-400/20 hover:bg-red-400/[0.16] transition-colors cursor-pointer"
                                    >
                                        Delete {chats.length}
                                    </button>
                                    <button
                                        onClick={() => setConfirmingAll(false)}
                                        className="px-2 py-1.5 rounded-md text-[11px] text-tone-450 hover:text-tone-750 hover:bg-fill-060 transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmingAll(true)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-tone-300 hover:text-red-300/80 hover:bg-red-400/[0.07] transition-colors cursor-pointer"
                                >
                                    <Trash2 size={12} /> Clear all conversations
                                </button>
                            )}
                        </div>
                    )}
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
                className="data-[size=sm]:h-6 w-fit max-w-[150px] gap-1 rounded-md border-none bg-transparent px-1.5 text-[10.5px] font-medium text-tone-450 shadow-none hover:bg-fill-070 hover:text-tone-800 focus-visible:ring-0 aria-expanded:bg-fill-070 aria-expanded:text-tone-800 dark:bg-transparent dark:hover:bg-fill-070 [&_svg]:size-3 [&_svg:not([class*='text-'])]:text-tone-300"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent
                position="popper"
                className="min-w-[9rem] rounded-lg border-line-090 bg-surface-menu/[0.97] backdrop-blur-md shadow-[0_8px_24px_var(--shadow-2)]"
            >
                {options.map(o => (
                    <SelectItem
                        key={o.id}
                        value={o.id}
                        className="text-[11px] text-tone-650 focus:bg-fill-070 focus:text-tone-900 [&_svg]:size-3"
                    >
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
