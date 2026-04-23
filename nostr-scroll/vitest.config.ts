import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      src: fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
    coverage: {
      all: false,
      provider: 'v8',
      reportsDirectory: './coverage/unit',
      reporter: ['text', 'html', 'json-summary'],
      exclude: [
        'coverage/**',
        'dist/**',
        'e2e/**',
        'node_modules/**',
        'playwright-report/**',
        'scripts/**',
        'test-results/**',
        'tests/**',
      ],
    },
  },
});
