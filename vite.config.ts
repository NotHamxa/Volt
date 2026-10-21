import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { createHash } from "crypto"
import tailwindcss from "@tailwindcss/vite"

/**
 * Content-Security-Policy for the packaged renderer. The window holds a
 * privileged bridge (commands, files), so nothing it didn't ship should run
 * or phone home: scripts are the bundle plus the inline theme snippet (by
 * hash), and images are local, data:, cached app icons (volt-icon:) and the
 * Google favicon service used for web/bang rows. Build-only: the dev server
 * injects inline scripts of its own.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "volt-csp",
    apply: "build",
    // "post": hash the inline script exactly as it ends up in the output.
    transformIndexHtml: { order: "post", handler(html) {
      // The HTML parser turns CRLF into LF before the browser hashes a script,
      // and index.html is checked out with Windows line endings.
      const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        .map(m => `'sha256-${createHash("sha256").update(m[1].replace(/\r\n?/g, "\n")).digest("base64")}'`);
      const policy = [
        "default-src 'self'",
        `script-src 'self' 'wasm-unsafe-eval' ${inline.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: volt-icon: https://www.google.com https://*.gstatic.com",
        "font-src 'self' data:",
        "connect-src 'self' data: blob:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
      ].join("; ");
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    } },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base:"./",
  build: {
    minify: 'esbuild',
    sourcemap: false,
  },
})
