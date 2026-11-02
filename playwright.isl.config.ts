import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/isl', timeout: 90000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5176', headless: true,
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
});
