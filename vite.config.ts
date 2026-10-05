import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Versão que aparece no rodapé do app: código (hash do commit, com * se há mudanças não salvas) e hora do build. */
function appVersion(): string {
  let rev = 'dev'
  try {
    rev = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) rev += '*'
  } catch {
    /* fora de um repositório git: fica "dev" */
  }
  const when = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Manaus',
  }).format(new Date())
  return `${rev} · ${when}`
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Em hospedagem numa subpasta (GitHub Pages) o build recebe VITE_BASE=/nome-do-repositorio/
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  server: { host: true },
  test: { include: ['src/**/*.test.ts'] },
})
