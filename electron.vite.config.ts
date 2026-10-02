import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

import { buildCsp } from './src/shared/network';

const alias = { '@shared': resolve(__dirname, 'src/shared') };

// Packaged builds load from file://, where response headers can't be injected,
// so the production CSP must be baked into index.html as a meta tag.
const injectCsp = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${buildCsp()}" />`
    ),
});

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        // The image worker is its own entry so it lands at out/main/image-worker.js.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'image-worker': resolve(__dirname, 'src/main/image-worker.ts'),
        },
      },
    },
  },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  renderer: { plugins: [react(), injectCsp()], resolve: { alias } },
});
