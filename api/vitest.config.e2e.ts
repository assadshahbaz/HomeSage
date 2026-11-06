import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/load-env.ts'],
    // The files share one MySQL, one Redis and one caller IP, so rate limit
    // counters and data would leak between files run side by side.
    fileParallelism: false,
  },
});
