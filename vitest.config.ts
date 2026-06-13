import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resuelve el alias "@/..." igual que tsconfig (apunta a src/).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
