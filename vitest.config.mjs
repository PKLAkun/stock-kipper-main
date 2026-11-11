import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.{js,jsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    env: { AUTH_SECRET: 'test-secret-test-secret-test-secret-1234' },
  },
});
