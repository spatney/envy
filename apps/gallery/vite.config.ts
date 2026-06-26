import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Alias @envy/core to its TypeScript source so edits hot-reload instantly
// without a separate build step — ideal for the visual iteration loop.
const coreSrc = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@envy/core': coreSrc,
    },
  },
  server: {
    port: 4317,
    strictPort: true,
  },
  build: {
    target: 'es2021',
  },
});
