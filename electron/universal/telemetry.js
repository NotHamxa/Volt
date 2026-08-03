import os from "os";

const TELEMETRY_URL = "https://www.hamzahmed.com/api/telemetry";
const PROJECT_NAME = "volt";

export async function sendTelemetry(event, detail) {
    try {
        const payload = {
            projectName: PROJECT_NAME,
            deviceId: os.hostname(),
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

    const ok = await sendTelemetry("install", `Installed at ${installedAt}`);
    if (ok) store.set("installTelemetrySent", true);
}
