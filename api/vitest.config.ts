import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'tools/**/*.ts'],
      // Wiring and re-exports: nothing to cover, and counting them hides the real number.
      exclude: [
        'src/main.ts',
        '**/*.module.ts',
        '**/*.symbol.ts',
        'src/contracts/index.ts',
        // The eval runner calls the real model; its pure parts have their own specs.
        '**/*.eval.ts',
      ],
      thresholds: {
        // The SQL feature is the security boundary: an untested branch there is a
        // path nobody has shown to be safe. `npm run test:cov` fails below this.
        'src/app/sql/**': { lines: 90, branches: 90 },
      },
    },
  },
});
