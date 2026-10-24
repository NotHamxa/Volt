/**
 * Whether a turn can actually run on a provider. Installed isn't enough for
 * the CLIs: one that's signed in to nothing fails every turn, so it isn't
 * counted until a sign-in is found. Key providers report available only once
 * a key is saved.
 */
export function isReady(provider: AiProviderInfo): boolean {
    if (!provider.available) return false;
    return provider.billing?.mode !== "unknown";
}

/** A CLI that's there but not signed in, the step most people miss. */
export function needsSignIn(provider: AiProviderInfo): boolean {
    return provider.available && provider.billing?.mode === "unknown";
}
