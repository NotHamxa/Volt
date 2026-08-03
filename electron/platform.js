// ─────────────────────────────────────────────────────────────────────────────
// Platform switch.
//
// This is the single place that binds the universal app to an OS-specific
// implementation. Universal code (electron/universal, electron/ipc,
// electron/main.js) imports every platform-specific operation from here — never
// from electron/win directly.
//
// To add another platform:
//   1. Create electron/<os>/ exporting the same names as electron/win/index.js
//      (see that file for the full contract).
//   2. Re-export it below for the matching process.platform value.
//
// ESM re-exports are static, so the switch is made by editing this line. Only
// Windows is implemented today.
// ─────────────────────────────────────────────────────────────────────────────

export * from "./win/index.js";

// Example once a Linux port exists:
//   export * from process.platform === "linux"
//       ? "./linux/index.js"
//       : "./win/index.js";
// (Static `export *` can't branch — split into per-platform entry files or use
//  a dynamic import in main.js if runtime selection becomes necessary.)
