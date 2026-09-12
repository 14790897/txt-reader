import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 150_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  projects: [
    {
      name: 'vscode',
      testMatch: 'txt-reader.spec.ts',
    },
  ],
});
