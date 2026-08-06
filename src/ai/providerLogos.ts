import claude from "@/assets/logos/claude.svg";
import openai from "@/assets/logos/openai.svg";
import gemini from "@/assets/logos/gemini.svg";
import ollama from "@/assets/logos/ollama.svg";
import deepseek from "@/assets/logos/deepseek.svg";
import grok from "@/assets/logos/grok.svg";

/**
 * Brand marks for the providers, from svgl.
 *
 * The dark-theme variant is used where a vendor ships one, so the white marks
 * read against this UI rather than disappearing into it. Each is a trademark of
 * its owner and appears only to identify the provider it belongs to.
 *
 * Codex shares OpenAI's mark: it is OpenAI's CLI, and there is no separate one.
 * Anything missing here falls back to a monogram, so a new adapter doesn't need
 * artwork before it can be listed.
 */
export const PROVIDER_LOGOS: Record<string, string> = {
    "claude-code": claude,
    codex: openai,
    openai,
    gemini,
    ollama,
    deepseek,
    grok,
};

/**
 * The marks that are a single flat white, with no colour of their own. They
 * were picked to read on a dark panel, so on a light one they turn invisible.
 * Inverting a pure-white glyph gives pure black, which is exactly the light
 * variant these vendors ship — so no second copy of the artwork is needed.
 *
 * The colourful marks (Claude, Gemini, DeepSeek) must never be inverted: it
 * would misrepresent the brand rather than adapt it.
 */
const WHITE_ONLY = new Set(["openai", "codex", "ollama", "grok"]);

export function providerLogo(providerId: string): string | null {
    return PROVIDER_LOGOS[providerId] ?? null;
}

/** Classes to hang on the logo's `<img>` so it survives a light background. */
export function providerLogoTint(providerId: string): string {
    return WHITE_ONLY.has(providerId) ? "invert dark:invert-0" : "";
}
