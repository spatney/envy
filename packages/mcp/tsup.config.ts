import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['graphein', '@graphein/node', '@modelcontextprotocol/sdk', 'zod'],
  target: 'es2021',
});
