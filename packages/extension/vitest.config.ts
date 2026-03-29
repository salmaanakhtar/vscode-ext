import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
      '@vscode-ext/shared': path.resolve(__dirname, '../shared/src'),
      '@vscode-ext/core': path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/__mocks__/**'],
    },
  },
});
