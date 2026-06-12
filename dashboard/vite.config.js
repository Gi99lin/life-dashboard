import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// The embedded <status-map> bundle (public/status-map.js) keeps a fixed
// filename, so Cloudflare/browsers cache it by extension and never pick up
// a redeploy. Append a content-hash query param at build time: the URL only
// changes when the bundle actually changes, busting the cache exactly when
// needed while staying cacheable otherwise.
function bustStatusMapCache() {
  return {
    name: 'bust-status-map-cache',
    transformIndexHtml(html) {
      let version = Date.now().toString(36);
      try {
        const file = readFileSync(resolve(__dirname, 'public/status-map.js'));
        version = createHash('sha256').update(file).digest('hex').slice(0, 8);
      } catch {
        // public/status-map.js missing — fall back to a build timestamp.
      }
      return html.replace('/status-map.js"', `/status-map.js?v=${version}"`);
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [bustStatusMapCache()],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
