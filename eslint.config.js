import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.{js,ts,cjs,mjs}',
      '**/coverage/**',
      '**/artifacts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Playwright-driven visual harness scripts run under Node (ESM) but also
    // contain page.evaluate() callbacks that reference browser globals.
    files: ['tests/visual/**/*.mjs', 'apps/gallery/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
  },
);
