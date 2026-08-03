import path from "path";
import fs from "fs";
import { app, safeStorage } from "electron";

/**
 * API keys, encrypted at rest with the OS keychain (DPAPI on Windows).
 *
 * Two rules hold here:
 *   - keys never enter electron-store, which is plaintext JSON on disk
 *   - keys never cross into the renderer; the bridge exposes only whether one
 *     is set. The main process attaches the value when it calls a provider.
 *
 * If OS encryption is unavailable we refuse to store rather than silently
 * writing plaintext — a key on disk in the clear is worse than no key.
 */
function keysFile() {
    return path.join(app.getPath("userData"), "ai-keys.bin");
}

function readAll() {
    try {
        const raw = fs.readFileSync(keysFile());
        if (!raw.length) return {};
        const json = safeStorage.decryptString(raw);
        return JSON.parse(json);
    } catch {
        // Missing file, or a blob this machine's key can no longer decrypt
        // (restored profile, new OS user) — treat as no keys set.
        return {};
    }
}

function writeAll(map) {
    const encrypted = safeStorage.encryptString(JSON.stringify(map));
    fs.writeFileSync(keysFile(), encrypted, { mode: 0o600 });
}

export function encryptionAvailable() {
    try {
        return safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
}

/** Main-process only. Never expose this over IPC. */
export function getKey(providerId) {
    return readAll()[providerId] ?? null;
}

export function setKey(providerId, key) {
    if (!encryptionAvailable()) {
        return { ok: false, detail: "OS encryption is unavailable, so the key cannot be stored securely." };
    }
    const trimmed = String(key ?? "").trim();
    if (!trimmed) return { ok: false, detail: "Enter a key first." };

    const all = readAll();
    all[providerId] = trimmed;
    try {
        writeAll(all);
        return { ok: true };
    } catch (err) {
        return { ok: false, detail: err?.message ?? "Could not write the key file." };
    }
}

export function clearKey(providerId) {
    const all = readAll();
    if (!(providerId in all)) return true;
    delete all[providerId];
    try {
        if (Object.keys(all).length === 0) fs.rmSync(keysFile(), { force: true });
        else writeAll(all);
        return true;
    } catch {
        return false;
    }
}

/** Safe to send to the renderer: presence only, never the value. */
export function keyStatus() {
    const all = readAll();
    return Object.fromEntries(Object.keys(all).map(id => [id, true]));
}
