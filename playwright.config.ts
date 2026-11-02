import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests/isl',testMatch:'*.spec.ts',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:3101',headless:true,
    launchOptions:{executablePath:process.env.ISL_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},
  },
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3101',url:'http://127.0.0.1:3101/tests/isl/harness.html',reuseExistingServer:true},
});
