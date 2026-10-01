import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
