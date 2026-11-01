import { defineConfig } from 'vitest/config';

// Unit tests only; the Playwright e2e tests in ./e2e run separately.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
