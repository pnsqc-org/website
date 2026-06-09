import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentOptions: {
      jsdom: {
        url: 'https://www.pnsqc.org/',
      },
    },
    include: ['tests/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/js/**/*.js'],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 64,
        functions: 80,
        lines: 84,
        statements: 82,
        perFile: true,
      },
    },
  },
});
