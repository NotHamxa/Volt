import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, ShieldAlert, Trash2, RefreshCw, FolderOpen } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { SectionLead, GroupLabel } from "@/components/settingsLayout.tsx";
import { providerLogo } from "@/ai/providerLogos.ts";

/**
 * Setup for the AI view: which backends are usable, keys for the ones that need
 * them, and what the prompt bar opens with.
 *
 * Keys are written through the main process into the OS keychain and are never
 * read back here — the bridge reports only whether one exists.
 */
/** needsKey is the honest split: sign in with a tool you have, or paste a key. */
const GROUPS = [
    { title: "CLIs & local", hint: "signed in through the tool itself", needsKey: false },
    { title: "API keys", hint: "billed per token", needsKey: true },
];

export default function AiSection() {
    const [providers, setProviders] = useState<AiProviderInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [keys, setKeys] = useState<Record<string, boolean>>({});
    const [canEncrypt, setCanEncrypt] = useState(true);
    const [prefs, setPrefsState] = useState<AiPrefs>({ providerId: null, model: null, settings: {}, workspace: null });
    const [workspace, setWorkspace] = useState<{ path: string; isDefault: boolean; defaultPath: string } | null>(null);

    const fetchAll = useCallback(() => Promise.all([
        window.ai.listProviders(),
        window.ai.keyStatus(),
        window.ai.getPrefs(),
        window.ai.workspace(),
    ]), []);

    const apply = useCallback(([list, status, saved, space]: Awaited<ReturnType<typeof fetchAll>>) => {
        setProviders(list);
        setKeys(status.keys);
        setCanEncrypt(status.encryptionAvailable);
        setPrefsState(saved);
        setWorkspace(space);
        setLoading(false);
    }, []);

    /** Re-read everything — used by the refresh button and after a key changes. */
    const load = useCallback(async () => apply(await fetchAll()), [apply, fetchAll]);

    // Guarded so a slow probe can't land after the section is switched away.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const data = await fetchAll();
            if (!cancelled) apply(data);
        })();
        return () => { cancelled = true; };
    }, [fetchAll, apply]);

    const defaultProvider = useMemo(() => {
        const chosen = providers.find(p => p.id === prefs.providerId);
        return chosen ?? providers.find(p => p.available) ?? providers[0] ?? null;
    }, [providers, prefs.providerId]);

    // Claude's effort levels differ per model, so the defaults panel has to ask
    // the selected model, not the provider.
    const defaultModelId = prefs.model ?? defaultProvider?.models[0]?.id ?? "";
    const defaultControls = defaultProvider
        ? defaultProvider.models.find(m => m.id === defaultModelId)?.controls ?? defaultProvider.controls
        : [];

    const savePrefs = async (patch: Partial<AiPrefs>) => {
        setPrefsState(await window.ai.setPrefs(patch));
    };

    if (loading) return <AiSectionSkeleton />;

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <SectionLead>
                    Ask questions without leaving Volt. Press <span className="text-white/60">Tab</span> from
                    the search bar, or pick <span className="text-white/60">Ask AI</span> in the results.
                </SectionLead>
                {!canEncrypt && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-400/[0.07] border border-amber-400/20">
                        <ShieldAlert size={13} className="mt-px shrink-0 text-amber-300/70" />
                        <p className="text-[11px] text-amber-200/70 leading-relaxed">
                            Your system can't encrypt stored secrets, so API keys can't be saved.
                            Providers that sign in through their own CLI still work.
                        </p>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <GroupLabel>Providers</GroupLabel>
                    <button
                        onClick={load}
                        className="flex items-center gap-1.5 text-[10.5px] text-white/30 hover:text-white/65 transition-colors cursor-pointer"
                    >
                        <RefreshCw size={11} /> Re-check
                    </button>
                </div>

                {providers.length === 0 && (
                    <p className="text-[11.5px] text-white/30">No providers are registered.</p>
                )}

                {/* Split by how you authenticate: sign in through a tool you
                    already have, or paste a key. */}
                {GROUPS.map(group => {
                    const members = providers.filter(p => p.needsKey === group.needsKey);
                    if (members.length === 0) return null;
                    return (
                        <div key={group.title} className="flex flex-col gap-2">
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-[11px] font-medium text-white/45">{group.title}</span>
                                <span className="text-[10px] text-white/20">{group.hint}</span>
                            </div>
                            {members.map(p => (
                                <ProviderCard
                                    key={p.id}
                                    provider={p}
                                    hasKey={Boolean(keys[p.id])}
                                    canEncrypt={canEncrypt}
                                    onChanged={load}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col gap-3">
                <GroupLabel>Defaults</GroupLabel>
                <p className="text-[11px] text-white/30 -mt-1 leading-relaxed">
                    What a new conversation starts with. You can still change any of it per chat.
                </p>

                <Row label="Provider" hint="Used when the AI view opens">
                    <SettingSelect
                        value={defaultProvider?.id ?? ""}
                        onChange={(id) => {
                            const p = providers.find(x => x.id === id);
                            savePrefs({ providerId: id, model: p?.models[0]?.id ?? null });
                        }}
                        options={providers.map(p => ({
                            id: p.id,
                            label: p.available ? p.label : `${p.label} (unavailable)`,
                        }))}
                    />
                </Row>

                {defaultProvider && defaultProvider.models.length > 0 && (
                    <Row label="Model" hint={defaultProvider.label}>
                        <SettingSelect
                            value={prefs.model ?? defaultProvider.models[0].id}
                            onChange={(model) => savePrefs({ model })}
                            options={defaultProvider.models.map(m => ({ id: m.id, label: m.label }))}
                        />
                    </Row>
                )}

                {/* Without an explicit root the CLIs inherit whatever directory
                    the app was launched from, which is nobody's choice. */}
                <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05]">
                    <div className="flex items-center justify-between gap-5">
                        <div className="min-w-0">
                            <p className="text-[12px] text-white/70">Working folder</p>
                            <p className="text-[10.5px] text-white/25 mt-0.5">
                                Where the CLI providers read and write files
                            </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                            <button
                                onClick={async () => {
                                    const picked = await window.electron.showFolderDialog();
                                    if (picked) {
                                        await savePrefs({ workspace: picked });
                                        setWorkspace(await window.ai.workspace());
                                    }
                                }}
                                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[11px] text-white/65 hover:bg-white/[0.09] hover:text-white/85 transition-colors cursor-pointer"
                            >
                                <FolderOpen size={12} /> Change
                            </button>
                            {workspace && !workspace.isDefault && (
                                <button
                                    onClick={async () => {
                                        await savePrefs({ workspace: null });
                                        setWorkspace(await window.ai.workspace());
                                    }}
                                    className="h-7 px-2.5 rounded-md text-[11px] text-white/35 hover:text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                    <p className="text-[10.5px] font-mono text-white/35 break-all">
                        {workspace?.path ?? "…"}
                        {workspace?.isDefault && (
                            <span className="ml-1.5 font-sans text-white/20">(managed default)</span>
                        )}
                    </p>
                </div>

                {defaultControls.map(control => (
                    <Row key={control.id} label={control.label} hint={defaultProvider.label}>
                        <SettingSelect
                            value={prefs.settings[defaultProvider.id]?.[control.id] ?? control.default}
                            onChange={(value) => savePrefs({
                                settings: {
                                    [defaultProvider.id]: {
                                        ...(prefs.settings[defaultProvider.id] ?? {}),
                                        [control.id]: value,
                                    },
                                },
                            })}
                            options={control.options}
                        />
                    </Row>
                ))}
            </div>
        </div>
    );
}

function ProviderCard({ provider, hasKey, canEncrypt, onChanged }: {
    provider: AiProviderInfo;
    hasKey: boolean;
    canEncrypt: boolean;
    onChanged: () => void;
}) {
    const [draft, setDraft] = useState("");
    const [reveal, setReveal] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const save = async () => {
        setBusy(true);
        setProblem(null);
        const result = await window.ai.setKey(provider.id, draft);
        setBusy(false);
        if (!result.ok) {
            setProblem(result.detail ?? "Could not save the key.");
            return;
        }
        setDraft("");
        setReveal(false);
        onChanged();
    };

    const remove = async () => {
        setBusy(true);
        await window.ai.clearKey(provider.id);
        setBusy(false);
        onChanged();
    };

    // A key-based provider is only really usable once a key is stored, whatever
    // its own reachability check says.
    const ready = provider.needsKey ? hasKey : provider.available;
    const logo = providerLogo(provider.id);

    return (
        <div className="px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:border-white/[0.09] transition-colors">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ready ? "bg-emerald-400/70" : "bg-white/20"}`} />
                        {logo && <img src={logo} alt="" className="w-4 h-4 shrink-0 object-contain" />}
                        <h3 className="text-[12.5px] font-medium text-white/80 tracking-tight">{provider.label}</h3>
                        {/* For a CLI, what matters is which wallet it draws on —
                            a plan you already pay for, or per-token billing. */}
                        {provider.needsKey ? (
                            <Badge tone="neutral">API key</Badge>
                        ) : provider.billing?.mode === "subscription" ? (
                            <Badge tone="good">{provider.billing.label}</Badge>
                        ) : provider.billing?.mode === "api-key" ? (
                            <Badge tone="warn">{provider.billing.label}</Badge>
                        ) : (
                            <Badge tone="neutral">Local / CLI</Badge>
                        )}
                    </div>
                    <p className="text-[11px] text-white/35 leading-relaxed mt-1 break-all">
                        {provider.needsKey
                            ? (hasKey ? "Key stored in your system keychain." : "Add a key to enable this provider.")
                            : (provider.detail ?? (ready ? "Ready." : "Not detected."))}
                    </p>
                    {!provider.needsKey && provider.billing?.mode === "api-key" && (
                        <p className="text-[10.5px] text-amber-300/55 leading-relaxed mt-1">
                            This CLI is signed in with an API key, so turns are billed per token
                            rather than drawn from a plan.
                        </p>
                    )}
                </div>
                {provider.needsKey && hasKey && (
                    <button
                        onClick={remove}
                        disabled={busy}
                        className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] text-white/30 hover:text-red-300/80 hover:bg-red-400/[0.07] transition-colors cursor-pointer disabled:opacity-40"
                    >
                        <Trash2 size={11} /> Remove
                    </button>
                )}
            </div>

            {provider.needsKey && !hasKey && (
                <div className="mt-2.5 flex items-center gap-1.5">
                    <div className="relative flex-1">
                        <KeyRound size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
                        <input
                            type={reveal ? "text" : "password"}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) save(); }}
                            disabled={!canEncrypt || busy}
                            placeholder={`${provider.label} API key`}
                            spellCheck={false}
                            autoComplete="off"
                            className="w-full h-7 pl-7 pr-7 rounded-md bg-white/[0.03] border border-white/[0.07] text-[11.5px] text-white/80 placeholder:text-white/20 outline-none focus:border-white/[0.16] transition-colors disabled:opacity-40"
                        />
                        <button
                            onClick={() => setReveal(r => !r)}
                            aria-label={reveal ? "Hide key" : "Show key"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
                        >
                            {reveal ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                    </div>
                    <button
                        onClick={save}
                        disabled={!canEncrypt || busy || !draft.trim()}
                        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-white/[0.07] border border-white/[0.08] text-[11px] text-white/70 hover:bg-white/[0.11] hover:text-white/90 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                    >
                        {busy ? <Spinner className="size-3" /> : <Check size={12} />} Save
                    </button>
                </div>
            )}

            {problem && <p className="mt-2 text-[10.5px] text-red-300/80">{problem}</p>}
        </div>
    );
}

/**
 * Shaped like the section it stands in for, so nothing jumps when the real
 * thing arrives. The provider counts mirror the adapters registered in
 * electron/universal/ai — three that sign in through a CLI, four that take a
 * key — which is what makes the swap seamless rather than merely busy.
 *
 * Worth having because this section is genuinely slow to load: it spawns the
 * Claude CLI and the Codex app-server to read their model catalogues.
 */
const CLI_PROVIDERS = 3;
const KEY_PROVIDERS = 4;

function ProviderCardSkeleton() {
    return (
        <div className="px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05]">
            <div className="flex items-center gap-2">
                <Skeleton className="w-1.5 h-1.5 rounded-full" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3.5 w-20 rounded" />
            </div>
            <Skeleton className="h-2.5 w-2/3 mt-2.5" />
        </div>
    );
}

function RowSkeleton() {
    return (
        <div className="flex items-center justify-between gap-5 px-4 py-2.5 rounded-lg bg-white/[0.025] border border-white/[0.05]">
            <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-2 w-24" />
            </div>
            <Skeleton className="h-7 w-44 rounded-md" />
        </div>
    );
}

function AiSectionSkeleton() {
    return (
        <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading AI settings">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/5" />
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-2.5 w-20" />
                    <Skeleton className="h-2.5 w-14" />
                </div>

                {[CLI_PROVIDERS, KEY_PROVIDERS].map((count, group) => (
                    <div key={group} className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-24 mt-1" />
                        {Array.from({ length: count }, (_, i) => <ProviderCardSkeleton key={i} />)}
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-3">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-2.5 w-3/4 -mt-1" />
                {Array.from({ length: 3 }, (_, i) => <RowSkeleton key={i} />)}
            </div>
        </div>
    );
}

function Badge({ tone, children }: { tone: "good" | "warn" | "neutral"; children: React.ReactNode }) {
    const tones = {
        good: "text-emerald-300/70 bg-emerald-400/[0.08] border-emerald-400/20",
        warn: "text-amber-300/70 bg-amber-400/[0.08] border-amber-400/20",
        neutral: "text-white/30 bg-white/[0.05] border-white/[0.06]",
    };
    return (
        <span className={`shrink-0 px-1.5 py-px rounded text-[9.5px] uppercase tracking-wide border ${tones[tone]}`}>
            {children}
        </span>
    );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-5 px-4 py-2.5 rounded-lg bg-white/[0.025] border border-white/[0.05]">
            <div className="min-w-0">
                <p className="text-[12px] text-white/70">{label}</p>
                {hint && <p className="text-[10.5px] text-white/25 mt-0.5">{hint}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

function SettingSelect({ value, onChange, options }: {
    value: string;
    onChange: (v: string) => void;
    options: Array<{ id: string; label: string }>;
}) {
    if (options.length === 0) return null;
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger
                size="sm"
                className="data-[size=sm]:h-7 w-44 rounded-md border-white/[0.08] bg-white/[0.03] px-2.5 text-[11.5px] text-white/75 shadow-none hover:bg-white/[0.06] focus-visible:ring-0 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] [&_svg]:size-3 [&_svg:not([class*='text-'])]:text-white/30"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent
                position="popper"
                className="rounded-lg border-white/[0.09] bg-[rgba(18,18,20,0.97)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            >
                {options.map(o => (
                    <SelectItem
                        key={o.id}
                        value={o.id}
                        className="text-[11.5px] text-white/65 focus:bg-white/[0.07] focus:text-white/90 [&_svg]:size-3"
                    >
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
