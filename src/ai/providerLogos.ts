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

export function providerLogo(providerId: string): string | null {
    return PROVIDER_LOGOS[providerId] ?? null;
}
