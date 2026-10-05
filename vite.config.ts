import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Em hospedagem numa subpasta (GitHub Pages) o build recebe VITE_BASE=/nome-do-repositorio/
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  server: { host: true },
  test: { include: ['src/**/*.test.ts'] },
})
