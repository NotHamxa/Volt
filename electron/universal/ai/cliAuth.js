import fs from "fs";
import os from "os";
import path from "path";

/**
 * Works out whether a CLI provider is billing against a subscription or an API
 * key — the two look identical once you're chatting, but one draws on a plan
 * you've already paid for and the other bills per token.
 *
 * Only non-secret descriptors are read: the mode, and the plan name. Tokens and
 * keys in these files are never touched, and nothing here is returned to the
 * renderer beyond a mode and a label.
 */

const UNKNOWN = { mode: "unknown", label: "Sign-in not detected" };

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

const titleCase = (value) =>
    String(value).replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/**
 * Claude Code: an OAuth blob means a Claude.ai plan. ANTHROPIC_API_KEY in the
 * environment overrides that and bills per token, so it is checked first.
 */
export function claudeAuthMode() {
    if (process.env.ANTHROPIC_API_KEY) {
        return { mode: "api-key", label: "Billing to ANTHROPIC_API_KEY" };
    }
    const creds = readJson(path.join(os.homedir(), ".claude", ".credentials.json"));
    const oauth = creds?.claudeAiOauth;
    if (!oauth) return UNKNOWN;

    const plan = oauth.subscriptionType ? `${titleCase(oauth.subscriptionType)} plan` : "Claude plan";
    return { mode: "subscription", label: plan };
}

/**
 * Codex records the choice explicitly in auth.json — "chatgpt" for a plan,
 * "apikey" for pay-as-you-go.
 */
export function codexAuthMode() {
    const auth = readJson(path.join(os.homedir(), ".codex", "auth.json"));
    if (!auth) {
        if (process.env.OPENAI_API_KEY) return { mode: "api-key", label: "Billing to OPENAI_API_KEY" };
        return UNKNOWN;
    }
    if (auth.auth_mode === "chatgpt") return { mode: "subscription", label: "ChatGPT plan" };
    if (auth.auth_mode === "apikey" || auth.OPENAI_API_KEY) {
        return { mode: "api-key", label: "Billing to an API key" };
    }
    return UNKNOWN;
}
