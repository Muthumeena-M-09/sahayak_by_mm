import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/voice', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5176', headless: true } });
