import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShieldAlert, RefreshCw, FolderOpen, ChevronRight, Info } from "lucide-react";
import { useNavigate } from "react-router";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { SectionLead, GroupLabel } from "@/components/settingsLayout.tsx";
import { providerLogo, providerLogoTint } from "@/ai/providerLogos.ts";
import { ModelPicker } from "@/ai/modelPicker.tsx";
import { isReady, needsSignIn } from "@/ai/readiness.ts";
import { AiSetupGuide } from "@/components/aiSetupGuide.tsx";

/**
 * Setup for the AI view: which CLIs are installed and signed in, and what the
 * prompt bar opens with. Volt holds no keys of its own; each CLI signs in
 * through its own tool.
 */

/**
 * `arrivedForSetup`: the AI view sent you here because nothing could answer
 * yet, so the guide leads and says why.
 */
export default function AiSection({ arrivedForSetup = false }: { arrivedForSetup?: boolean }) {
    const navigate = useNavigate();
    const [providers, setProviders] = useState<AiProviderInfo[]>([]);
    const [checking, setChecking] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [prefs, setPrefsState] = useState<AiPrefs>({
        providerId: null, model: null, settings: {}, workspace: null, customModels: {}, claudeSkipPermissions: false, keepOpen: true,
    });
    const [workspace, setWorkspace] = useState<{ path: string; isDefault: boolean; defaultPath: string } | null>(null);

    const fetchAll = useCallback(async () => {
        const [list, saved, space] = await Promise.all([
            window.ai.listProviders(),
            window.ai.getPrefs(),
            window.ai.workspace(),
        ]);
        // Only the provider whose defaults are shown needs a catalogue; reading
        // every one costs a CLI spawn each.
        const active = list.find(p => p.id === saved.providerId)
            ?? list.find(p => p.available) ?? list[0];
        if (active) {
            const models = await window.ai.providerModels(active.id);
            active.models = models;
        }
        return [list, saved, space] as const;
    }, []);

    const apply = useCallback(([list, saved, space]: Awaited<ReturnType<typeof fetchAll>>) => {
        setProviders(list);
        setPrefsState(saved);
        setWorkspace(space);
        setLoading(false);
    }, []);

    /** Re-read everything, used by the refresh buttons. */
    const load = useCallback(async () => {
        setChecking(true);
        try {
            apply(await fetchAll());
        } finally {
            setChecking(false);
        }
    }, [apply, fetchAll]);

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

    // The dangerous option picked as a default, if any, Full access.
    const defaultDanger = defaultProvider
        ? defaultControls
            .map(c => c.options.find(o => o.id === (prefs.settings[defaultProvider.id]?.[c.id] ?? c.default)))
            .find(o => o?.danger) ?? null
        : null;

    const savePrefs = async (patch: Partial<AiPrefs>) => {
        setPrefsState(await window.ai.setPrefs(patch));
    };

    // Catalogues are read only for providers actually browsed in the picker,
    // each one costs a CLI spawn.
    const loadingModels = useRef(new Set<string>());
    const ensureModels = useCallback(async (id: string) => {
        if (!id || loadingModels.current.has(id)) return;
        if (providers.find(p => p.id === id)?.models.length) return;
        loadingModels.current.add(id);
        const models = await window.ai.providerModels(id);
        setProviders(list => list.map(p => (p.id === id ? { ...p, models } : p)));
    }, [providers]);

    const customModels = prefs.customModels ?? {};
    const anyReady = providers.some(isReady);
    // Leads the section until something works; after that it folds away,
    // still there for adding a second provider.
    const showGuide = !anyReady || arrivedForSetup || guideOpen;

    if (loading) return <AiSectionSkeleton />;

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <SectionLead>
                    Ask questions without leaving Volt. Press <span className="text-tone-600">Tab</span> from
                    the search bar, or pick <span className="text-tone-600">Ask AI</span> in the results.
                </SectionLead>
                {arrivedForSetup && !anyReady && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-sky-400/[0.07] border border-sky-400/20">
                        <Info size={13} className="mt-px shrink-0 text-sky-300/70" />
                        <p className="text-11 text-sky-100/75 leading-relaxed">
                            AI needs somewhere to send your questions first. Pick one of the options below. It only takes a couple of minutes.
                        </p>
                    </div>
                )}
            </div>

            {showGuide ? (
                <AiSetupGuide
                    providers={providers}
                    checking={checking}
                    onRecheck={load}
                    onStart={anyReady ? () => navigate("/ai") : undefined}
                />
            ) : (
                <button
                    onClick={() => setGuideOpen(true)}
                    className="-my-4 self-start flex items-center gap-1 text-11 text-tone-300 hover:text-tone-650 transition-colors cursor-pointer"
                >
                    Setup guide: add another provider <ChevronRight size={11} />
                </button>
            )}

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <GroupLabel>Providers</GroupLabel>
                    <button
                        onClick={load}
                        className="flex items-center gap-1.5 text-10.5 text-tone-300 hover:text-tone-650 transition-colors cursor-pointer"
                    >
                        <RefreshCw size={11} /> Re-check
                    </button>
                </div>

                {providers.length === 0 && (
                    <p className="text-11.5 text-tone-300">No providers are registered.</p>
                )}

                {providers.map(p => <ProviderCard key={p.id} provider={p} />)}
            </div>

            <div className="flex flex-col gap-3">
                <GroupLabel>Defaults</GroupLabel>
                <p className="text-11 text-tone-300 -mt-1 leading-relaxed">
                    What a new conversation starts with. You can still change any of it per chat.
                </p>

                {/* The same picker as the chat composer: provider and model in
                    one control, so a provider's catalogue is browsed before
                    committing to it, and any unlisted model id can be typed. */}
                {defaultProvider && (
                    <Row label="Default model" hint="Used when the AI view opens">
                        <ModelPicker
                            variant="field"
                            providers={providers}
                            providerId={defaultProvider.id}
                            model={defaultModelId}
                            customModels={customModels}
                            onBrowse={ensureModels}
                            onSelect={(providerId, model) => savePrefs({ providerId, model })}
                            onRemember={(id, modelId) => savePrefs({
                                customModels: { [id]: [...new Set([...(customModels[id] ?? []), modelId])] },
                            })}
                            onForget={(id, modelId) => savePrefs({
                                customModels: { [id]: (customModels[id] ?? []).filter(m => m !== modelId) },
                            })}
                        />
                    </Row>
                )}

                {/* Without an explicit root the CLIs inherit whatever directory
                    the app was launched from, which is nobody's choice. */}
                <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-fill-025 border border-line-050">
                    <div className="flex items-center justify-between gap-5">
                        <div className="min-w-0">
                            <p className="text-12 text-tone-700">Working folder</p>
                            <p className="text-10.5 text-tone-250 mt-0.5">
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
                                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-fill-050 border border-line-080 text-11 text-tone-650 hover:bg-fill-090 hover:text-tone-850 transition-colors cursor-pointer"
                            >
                                <FolderOpen size={12} /> Change
                            </button>
                            {workspace && !workspace.isDefault && (
                                <button
                                    onClick={async () => {
                                        await savePrefs({ workspace: null });
                                        setWorkspace(await window.ai.workspace());
                                    }}
                                    className="h-7 px-2.5 rounded-md text-11 text-tone-350 hover:text-tone-700 hover:bg-fill-060 transition-colors cursor-pointer"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                    <p className="text-10.5 font-mono text-tone-350 break-all">
                        {workspace?.path ?? "…"}
                        {workspace?.isDefault && (
                            <span className="ml-1.5 font-sans text-tone-200">(managed default)</span>
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

                {/* A chat can carry pasted text or fetched pages written by
                    someone else, and in full access that text can run
                    commands. Said plainly wherever it's made the default. */}
                {defaultDanger && (
                    <div className="flex items-start gap-2 px-4 py-3 rounded-lg border bg-red-400/[0.05] border-red-400/25">
                        <ShieldAlert size={12} className="mt-px shrink-0 text-red-300/70" />
                        <p className="text-10.5 text-red-200/70 leading-relaxed">
                            New conversations start in {defaultDanger.label}. {defaultProvider.label} can run any
                            command, edit or delete any file your account can reach, and send data anywhere,
                            including when instructions hidden in pasted text or a web page tell it to.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProviderCard({ provider }: { provider: AiProviderInfo }) {
    const ready = isReady(provider);
    const logo = providerLogo(provider.id);

    return (
        <div className="px-4 py-3 rounded-lg bg-fill-025 border border-line-050 hover:border-line-090 transition-colors">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ready ? "bg-emerald-400/70" : "bg-ink/20"}`} />
                        {logo && <img src={logo} alt="" className={`w-4 h-4 shrink-0 object-contain ${providerLogoTint(provider.id)}`} />}
                        <h3 className="text-12.5 font-medium text-tone-800 tracking-tight">{provider.label}</h3>
                        {/* For a CLI, what matters is which wallet it draws on,
                            a plan you already pay for, or per-token billing. */}
                        {needsSignIn(provider) ? (
                            <Badge tone="warn">Not signed in</Badge>
                        ) : provider.billing?.mode === "subscription" ? (
                            <Badge tone="good">{provider.billing.label}</Badge>
                        ) : provider.billing?.mode === "api-key" ? (
                            <Badge tone="warn">{provider.billing.label}</Badge>
                        ) : (
                            <Badge tone="neutral">CLI</Badge>
                        )}
                    </div>
                    <p className="text-11 text-tone-350 leading-relaxed mt-1 break-all">
                        {needsSignIn(provider)
                            ? "Installed, but not signed in yet. The setup guide above walks you through it."
                            : (provider.detail ?? (ready ? "Ready." : "Not detected."))}
                    </p>
                    {provider.billing?.mode === "api-key" && (
                        <p className="text-10.5 text-amber-300/55 leading-relaxed mt-1">
                            This CLI is signed in with an API key, so turns are billed per token
                            rather than drawn from a plan.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Shaped like the section it stands in for, so nothing jumps when the real
 * thing arrives. The provider count mirrors the adapters registered in
 * electron/universal/ai, which is what makes the swap seamless rather than
 * merely busy.
 *
 * Worth having because this section is genuinely slow to load: it spawns the
 * Claude CLI and the Codex app-server to read their model catalogues.
 */
const CLI_PROVIDERS = 2;

function ProviderCardSkeleton() {
    return (
        <div className="px-4 py-3 rounded-lg bg-fill-025 border border-line-050">
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
        <div className="flex items-center justify-between gap-5 px-4 py-2.5 rounded-lg bg-fill-025 border border-line-050">
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

                <div className="flex flex-col gap-2">
                    {Array.from({ length: CLI_PROVIDERS }, (_, i) => <ProviderCardSkeleton key={i} />)}
                </div>
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
        neutral: "text-tone-300 bg-fill-050 border-line-060",
    };
    return (
        <span className={`shrink-0 px-1.5 py-px rounded text-9.5 uppercase tracking-wide border ${tones[tone]}`}>
            {children}
        </span>
    );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-5 px-4 py-2.5 rounded-lg bg-fill-025 border border-line-050">
            <div className="min-w-0">
                <p className="text-12 text-tone-700">{label}</p>
                {hint && <p className="text-10.5 text-tone-250 mt-0.5">{hint}</p>}
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
                className="data-[size=sm]:h-7 w-44 rounded-md border-line-080 bg-fill-030 px-2.5 text-11.5 text-tone-750 shadow-none hover:bg-fill-060 focus-visible:ring-0 dark:bg-fill-030 dark:hover:bg-fill-060 [&_svg]:size-3 [&_svg:not([class*='text-'])]:text-tone-300"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent
                position="popper"
                className="rounded-lg border-line-090 bg-surface-menu/[0.97] backdrop-blur-md shadow-[0_8px_24px_var(--shadow-2)]"
            >
                {options.map(o => (
                    <SelectItem
                        key={o.id}
                        value={o.id}
                        className="text-11.5 text-tone-650 focus:bg-fill-070 focus:text-tone-900 [&_svg]:size-3"
                    >
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
