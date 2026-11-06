import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Each file starts its own app and fake HomeSage on fixed ports.
    fileParallelism: false,
  },
});
