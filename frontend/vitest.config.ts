import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { extensionAliases } from './extensions.config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: extensionAliases },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // pool: 'vmThreads' — breaks tests that mutate window.location (global redefinition)
    // e2e/ holds Playwright browser tests (run by scripts/e2e.sh), not Vitest unit tests.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
