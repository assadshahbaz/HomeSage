import { defineConfig } from 'vitest/config';

// `npm run evals`: real model calls, real MySQL, a committed report. Never part
// of `npm test` or CI, since it spends model quota and needs the Docker stack.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['tools/evals/**/*.eval.ts'],
    setupFiles: ['./test/load-env.ts'],
  },
});
