import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom gives us localStorage, window, etc.
    environment: 'jsdom',
    globals: true,
    // fake-indexeddb is set up per-test file via setupFiles
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/components/editor/plugins/DocumentSavePlugin.tsx'],
    },
  },
});
