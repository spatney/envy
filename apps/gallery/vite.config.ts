import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { grapheinBackend } from './src/server/backend';

// Alias the workspace packages to their TypeScript source so edits hot-reload
// instantly without a separate build step — ideal for the visual iteration loop.
const coreSrc = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));
const reactSrc = fileURLToPath(new URL('../../packages/react/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), grapheinBackend()],
  resolve: {
    alias: {
      graphein: coreSrc,
      '@graphein/react': reactSrc,
    },
  },
  server: {
    port: 4317,
    strictPort: true,
  },
  preview: {
    port: 4317,
    strictPort: true,
  },
  build: {
    target: 'es2021',
    chunkSizeWarningLimit: 1400,
  },
});
