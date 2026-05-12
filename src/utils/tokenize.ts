// Quote-aware token split. Used to map free-form input ("foo bar 'with space'")
// to positional command-argument values.
export function tokenize(input: string): string[] {
    const tokens: string[] = [];
    let buf = "";
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (quote) {
            if (ch === quote) quote = null;
            else buf += ch;
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (/\s/.test(ch)) {
            if (buf) { tokens.push(buf); buf = ""; }
            continue;
        }
        buf += ch;
    }
    if (buf) tokens.push(buf);
    return tokens;
}
