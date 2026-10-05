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
    // E2E_PROD=1 testa o build de produção (o que o cliente realmente usa), não o servidor de desenvolvimento
    command: process.env.E2E_PROD ? 'npx vite build && npx vite preview --port 5199 --strictPort' : 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
