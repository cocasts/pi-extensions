import { defineConfig } from 'vitest/config';

export default defineConfig({
  include: ['packages/*/test/**/*.test.ts'],
  environment: 'node',
  testTimeout: 20_000,
});
