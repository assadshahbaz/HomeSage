import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'tools/**/*.ts'],
      // Wiring only: nothing to cover, and counting it hides the real number.
      exclude: ['src/main.ts', '**/*.module.ts', '**/*.symbol.ts'],
    },
  },
});
