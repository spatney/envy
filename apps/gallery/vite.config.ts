import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Alias graphein to its TypeScript source so edits hot-reload instantly
// without a separate build step — ideal for the visual iteration loop.
const coreSrc = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));
const reactSrc = fileURLToPath(new URL('../../packages/react/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'graphein': coreSrc,
      '@graphein/react': reactSrc,
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
