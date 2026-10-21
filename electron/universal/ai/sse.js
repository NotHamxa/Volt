/**
 * Reads a Server-Sent Events body and yields each event's `data`.
 *
 * Shared by the API adapters, and written to the spec rather than to whatever
 * one vendor happened to send: lines may end in \n, \r\n or a bare \r; an event
 * ends at a blank line; several `data:` lines in one event join with "\n"; and
 * a stream that closes without a trailing blank line still delivers its last
 * event. Splitting on "\n\n" alone got all three wrong — a CRLF stream yielded
 * nothing at all.
 *
 * Payloads are yielded as-is; sentinels like OpenAI's "[DONE]" are the
 * caller's business.
 */
export async function* sseEvents(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let data = [];
    let finished = false;

    // One line of the stream; returns a finished event's payload, if any.
    const takeLine = (line) => {
        if (line === "") {
            if (!data.length) return null;
            const payload = data.join("\n");
            data = [];
            return payload;
        }
        if (line.startsWith(":")) return null; // comment / keep-alive
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "data") data.push(value);
        return null;
    };

    // A trailing "\r" may be the first half of a "\r\n" split across chunks,
    // so it is only treated as a line end once something follows it.
    const LINE_END = /\r\n|\r(?!$)|\n/;

    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

            let match;
            while ((match = LINE_END.exec(buffer))) {
                const line = buffer.slice(0, match.index);
                buffer = buffer.slice(match.index + match[0].length);
                const payload = takeLine(line);
                if (payload !== null) yield payload;
            }

            if (done) {
                // Whatever is left is a final line with no terminator, and the
                // event it belongs to is dispatched rather than dropped.
                for (const line of [...buffer.split(/\r\n|\r|\n/), ""]) {
                    const payload = takeLine(line);
                    if (payload !== null) yield payload;
                }
                finished = true;
                return;
            }
        }
    } finally {
        // Also reached when the caller stops early ([DONE], an in-band error,
        // an abort) — the connection is released either way.
        if (!finished) reader.cancel().catch(() => {});
        try { reader.releaseLock(); } catch { /* already released */ }
    }
}
