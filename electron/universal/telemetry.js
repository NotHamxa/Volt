import { randomUUID } from "node:crypto";
import Store from "electron-store";

const TELEMETRY_URL = "https://www.hamzahmed.com/api/telemetry";
const PROJECT_NAME = "volt";

// A random per-install id. The computer's name used to be sent instead, and
// that is often the user's real name.
function deviceId(store) {
    let id = store.get("telemetryDeviceId");
    if (!id) {
        id = randomUUID();
        store.set("telemetryDeviceId", id);
    }
    return id;
}

export async function sendTelemetry(event, detail, store = new Store()) {
    try {
        const payload = {
            projectName: PROJECT_NAME,
            deviceId: deviceId(store),
            event,
            ...(detail ? { detail } : {}),
        };
        const res = await fetch(TELEMETRY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return res.ok;
    } catch (err) {
        console.warn("Telemetry send failed:", err?.message ?? err);
        return false;
    }
}

export async function sendInstallTelemetryIfNeeded(store) {
    if (store.get("installTelemetrySent") === true) return;

    let installedAt = store.get("installedAt");
    if (!installedAt) {
        installedAt = new Date().toISOString();
        store.set("installedAt", installedAt);
    }

    const ok = await sendTelemetry("install", `Installed at ${installedAt}`, store);
    if (ok) store.set("installTelemetrySent", true);
}
