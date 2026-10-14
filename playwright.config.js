import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const existingChromium=path.join(homedir(),'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const executablePath=process.env.UPTIME_BROWSER_PATH || (existsSync(existingChromium)?existingChromium:undefined);
export default defineConfig({
  testDir:'./test/browser',
  timeout:45000,
  workers:1,
  retries:0,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:900},headless:true,launchOptions:{executablePath},screenshot:'only-on-failure',trace:'retain-on-failure'},
  reporter:'list',
  webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:20000},
});
