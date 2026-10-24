import { useState } from "react";
import { Check, ExternalLink, KeyRound, Play, RefreshCw, ArrowRight } from "lucide-react";
import { CopyButton } from "@/ai/copyButton.tsx";
import { providerLogo, providerLogoTint } from "@/ai/providerLogos.ts";
import { isReady } from "@/ai/readiness.ts";

/**
 * Getting from nothing to a working AI view, for someone who has never opened
 * a terminal. Three ways in, a Claude plan, a ChatGPT plan, or an API key,
 * each laid out as steps that tick themselves off as Volt detects them.
 *
 * Every command is shown so it can be copied, and the CLI steps can also be
 * run for you: Volt opens PowerShell with the command already going.
 */

type Path = "claude" | "chatgpt" | "key";
type SetupStep = Parameters<typeof window.ai.runSetup>[0];

const KEY_SITES = [
    { id: "anthropic", label: "Claude", url: "https://platform.claude.com/settings/keys" },
    { id: "openai", label: "OpenAI", url: "https://platform.openai.com/api-keys" },
    { id: "gemini", label: "Gemini", url: "https://aistudio.google.com/apikey" },
    { id: "deepseek", label: "DeepSeek", url: "https://platform.deepseek.com/api_keys" },
    { id: "grok", label: "Grok (xAI)", url: "https://console.x.ai" },
];

export function AiSetupGuide({ providers, onRecheck, onJumpToKeys, onStart, checking }: {
    providers: AiProviderInfo[];
    onRecheck: () => void;
    /** Scrolls to the key fields further down the section. */
    onJumpToKeys: () => void;
    /** Shown once something is ready: opens the AI view. */
    onStart?: () => void;
    checking: boolean;
}) {
    const claude = providers.find(p => p.id === "claude-code");
    const codex = providers.find(p => p.id === "codex");
    // Start on whichever path is already part-way done.
    const [path, setPath] = useState<Path>(() =>
        codex?.available && !claude?.available ? "chatgpt" : "claude");

    const tabs: Array<{ id: Path; label: string; hint: string; logo?: string | null; tint?: string }> = [
        { id: "claude", label: "Claude plan", hint: "Pro or Max", logo: providerLogo("claude-code") },
        { id: "chatgpt", label: "ChatGPT plan", hint: "Plus or Pro", logo: providerLogo("codex"), tint: providerLogoTint("codex") },
        { id: "key", label: "API key", hint: "Pay per use" },
    ];

    return (
        <div data-walkthrough="ai-setup" className="flex flex-col gap-3 px-4 py-3.5 rounded-lg bg-fill-025 border border-line-070">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-12.5 font-medium text-tone-800">Set up AI</p>
                    <p className="text-11 text-tone-350 mt-0.5 leading-relaxed">
                        Choose how you'll pay for answers. You only need one, and a plan you already have costs nothing extra.
                    </p>
                </div>
                <button
                    onClick={onRecheck}
                    disabled={checking}
                    className="shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-fill-050 border border-line-080 text-11 text-tone-600 hover:bg-fill-090 hover:text-tone-850 transition-colors cursor-pointer disabled:opacity-50"
                >
                    <RefreshCw size={11} className={checking ? "animate-spin" : ""} /> Re-check
                </button>
            </div>

            <div role="tablist" className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-fill-030 border border-line-050">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={path === tab.id}
                        onClick={() => setPath(tab.id)}
                        className={`flex items-center justify-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                            path === tab.id ? "bg-fill-090 text-tone-850" : "text-tone-400 hover:text-tone-700 hover:bg-fill-050"
                        }`}
                    >
                        {tab.logo
                            ? <img src={tab.logo} alt="" className={`w-3.5 h-3.5 object-contain ${tab.tint ?? ""}`} />
                            : <KeyRound size={12} />}
                        <span className="text-11.5">{tab.label}</span>
                        <span className="text-9.5 text-tone-250">{tab.hint}</span>
                    </button>
                ))}
            </div>

            {path === "claude" && (
                <Steps steps={[
                    {
                        title: "Install Claude Code",
                        body: "Anthropic's installer, run in PowerShell. No admin rights needed, and it keeps itself up to date.",
                        command: "irm https://claude.ai/install.ps1 | iex",
                        run: "claude-install",
                        done: Boolean(claude?.available),
                    },
                    {
                        title: "Sign in with your Claude account",
                        body: "Needs a Pro or Max plan. The free plan doesn't include Claude Code. A browser window opens to finish signing in.",
                        command: "claude auth login",
                        run: "claude-login",
                        done: Boolean(claude && isReady(claude)),
                        note: claude?.billing?.mode === "api-key"
                            ? "Signed in with an API key from your environment, so answers bill per token rather than to a plan."
                            : undefined,
                    },
                ]} />
            )}

            {path === "chatgpt" && (
                <Steps steps={[
                    {
                        title: "Install Node.js",
                        body: "Codex installs with npm, which comes with Node.js. Skip this if you already have it.",
                        link: { label: "Download Node.js (LTS)", url: "https://nodejs.org/en/download" },
                        done: Boolean(codex?.available),
                        optional: true,
                    },
                    {
                        title: "Install Codex",
                        body: "OpenAI's coding agent, installed with npm.",
                        command: "npm install -g @openai/codex",
                        run: "codex-install",
                        done: Boolean(codex?.available),
                    },
                    {
                        title: "Sign in with ChatGPT",
                        body: "Pick “Sign in with ChatGPT” in the browser window that opens. Works with Plus, Pro, Business and Enterprise plans.",
                        command: "codex login",
                        run: "codex-login",
                        done: Boolean(codex && isReady(codex)),
                    },
                ]} />
            )}

            {path === "key" && (
                <div className="flex flex-col gap-2.5">
                    <p className="text-11 text-tone-450 leading-relaxed">
                        Create a key on the provider's site, then paste it into its card under <span className="text-tone-650">API keys</span> below.
                        You're billed per use by that provider. Keys are encrypted with your Windows account and never leave this computer except to that provider.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {KEY_SITES.map(site => {
                            const logo = providerLogo(site.id);
                            return (
                                <button
                                    key={site.id}
                                    onClick={() => window.electron.openExternal(site.url)}
                                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-fill-040 border border-line-070 text-11 text-tone-650 hover:bg-fill-080 hover:text-tone-850 transition-colors cursor-pointer"
                                >
                                    {logo && <img src={logo} alt="" className={`w-3.5 h-3.5 object-contain ${providerLogoTint(site.id)}`} />}
                                    Get a {site.label} key <ExternalLink size={10} className="text-tone-300" />
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={onJumpToKeys}
                        className="self-start flex items-center gap-1.5 text-11 text-sky-300/80 hover:text-sky-300 transition-colors cursor-pointer"
                    >
                        Paste your key <ArrowRight size={11} />
                    </button>
                </div>
            )}

            {onStart && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-emerald-400/[0.07] border border-emerald-400/20">
                    <p className="text-11 text-emerald-200/80">You're set up.</p>
                    <button
                        onClick={onStart}
                        className="flex items-center gap-1.5 h-6.5 px-2.5 rounded-md bg-ink/[0.85] text-11 text-surface hover:bg-ink transition-colors cursor-pointer"
                    >
                        Start chatting <ArrowRight size={11} />
                    </button>
                </div>
            )}
        </div>
    );
}

type StepSpec = {
    title: string;
    body: string;
    command?: string;
    run?: SetupStep;
    link?: { label: string; url: string };
    done: boolean;
    /** Not needed by everyone, so never the step marked as next. */
    optional?: boolean;
    note?: string;
};

function Steps({ steps }: { steps: StepSpec[] }) {
    // The first required step not yet done is the one to do now; later ones
    // are shown, but quieter.
    const current = steps.findIndex(s => !s.done && !s.optional);
    return (
        <ol className="flex flex-col gap-2">
            {steps.map((step, i) => (
                <StepRow
                    key={step.title}
                    index={i + 1}
                    step={step}
                    state={step.done ? "done" : i === current ? "current" : i > current && current !== -1 ? "later" : "open"}
                />
            ))}
        </ol>
    );
}

function StepRow({ index, step, state }: { index: number; step: StepSpec; state: "done" | "current" | "later" | "open" }) {
    const [launched, setLaunched] = useState<boolean | null>(null);

    return (
        <li className={`flex gap-3 px-3 py-2.5 rounded-md border transition-colors ${
            state === "current" ? "bg-fill-040 border-line-090" : "border-transparent"
        } ${state === "later" ? "opacity-55" : ""}`}>
            <span className={`mt-px flex w-5 h-5 shrink-0 items-center justify-center rounded-full text-10 tabular-nums ${
                state === "done"
                    ? "bg-emerald-400/[0.16] text-emerald-300/90"
                    : state === "current" ? "bg-ink/[0.85] text-surface" : "bg-fill-070 text-tone-400"
            }`}>
                {state === "done" ? <Check size={11} /> : index}
            </span>
            <div className="min-w-0 flex-1">
                <p className={`text-12 ${state === "done" ? "text-tone-450" : "text-tone-800"}`}>
                    {step.title}
                    {step.optional && <span className="ml-1.5 text-10 text-tone-250">if needed</span>}
                    {state === "done" && <span className="ml-1.5 text-10 text-emerald-300/70">Done</span>}
                </p>
                {state !== "done" && (
                    <>
                        <p className="text-11 text-tone-350 leading-relaxed mt-0.5">{step.body}</p>
                        {step.command && (
                            <div className="mt-2 flex items-center gap-1.5">
                                <code className="min-w-0 flex-1 truncate px-2 py-1 rounded-md bg-[var(--code-bg)] border border-line-070 font-mono text-10.5 text-tone-700">
                                    {step.command}
                                </code>
                                <CopyButton getText={() => step.command ?? ""} label="Copy command" className="w-7 h-6.5 hover:bg-fill-070" />
                                {step.run && (
                                    <button
                                        onClick={async () => setLaunched(await window.ai.runSetup(step.run!))}
                                        title="Opens PowerShell with this command running"
                                        className="flex items-center gap-1.5 h-6.5 px-2.5 rounded-md bg-fill-070 border border-line-080 text-11 text-tone-750 hover:bg-fill-110 hover:text-tone-900 transition-colors cursor-pointer"
                                    >
                                        <Play size={10} className="fill-current" /> Run it for me
                                    </button>
                                )}
                            </div>
                        )}
                        {step.link && (
                            <button
                                onClick={() => window.electron.openExternal(step.link!.url)}
                                className="mt-1.5 flex items-center gap-1.5 text-11 text-sky-300/80 hover:text-sky-300 transition-colors cursor-pointer"
                            >
                                {step.link.label} <ExternalLink size={10} />
                            </button>
                        )}
                        {launched === false && (
                            <p className="mt-1.5 text-10.5 text-red-300/80">Couldn't open PowerShell. Copy the command and run it yourself.</p>
                        )}
                        {launched && (
                            <p className="mt-1.5 text-10.5 text-tone-300">
                                Follow along in the PowerShell window. When it's finished, come back and click Re-check.
                            </p>
                        )}
                    </>
                )}
                {step.note && <p className="mt-1 text-10.5 text-amber-300/60 leading-relaxed">{step.note}</p>}
            </div>
        </li>
    );
}
