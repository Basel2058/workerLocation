import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.ts', 'shared/**/*.test.ts', 'web/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    pool: 'forks',
    env: { NODE_ENV: 'test', ONSITE_FAST_HASH: '1' },
  },
});
