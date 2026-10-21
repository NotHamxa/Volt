export type LinkShortcutType = {
    name: string,
    shortcut:string
    /** Global hotkey that opens it from anywhere, as an Electron accelerator. */
    hotkey?: string
}