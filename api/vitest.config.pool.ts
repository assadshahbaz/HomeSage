import { defineConfig } from 'vitest/config';

// `npm run evals:pool`: builds the labelling worksheet from the real index and
// MySQL. Never part of `npm test` or CI, since it needs the Docker stack and a
// full index, and it writes files under `workbench/evals/labelling/`.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['tools/evals/**/*.pool.ts'],
    setupFiles: ['./test/load-env.ts'],
  },
});
