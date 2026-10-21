import { tokenize } from "@/utils/tokenize.ts";

// Same folding as the main process's normaliseString, so a word that matched
// the command there is recognised as part of its name here.
const normalise = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[\s\-_.()[\]{}'"!?,:;/\\|]+/g, "");

/**
 * The positional argument values typed after a command's name: "kill port
 * 3000" on "Kill Port {port}" gives ["3000"], and "kill port" gives none.
 * Leading words are dropped while they still spell the start of the name
 * (placeholders aside); the first word always goes, since it found the command.
 */
export function positionalArgs(query: string, commandName: string): string[] {
    const tokens = tokenize(query);
    const name = normalise(commandName.replace(/\{[^}]*\}/g, " "));
    let consumed = Math.min(1, tokens.length);
    let typed = normalise(tokens.slice(0, consumed).join(""));
    while (consumed < tokens.length) {
        const next = typed + normalise(tokens[consumed]);
        if (!next || !name.startsWith(next)) break;
        typed = next;
        consumed++;
    }
    return tokens.slice(consumed);
}
