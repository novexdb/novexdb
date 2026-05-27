import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Shared Vitest config — jsdom env so renderer modules that touch `document`
 * / `window` work, and Node-only pure utils run fine too. Path aliases
 * mirror electron-vite's runtime config so test imports look exactly like
 * app imports.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/*.d.ts']
    }
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@preload': resolve(__dirname, 'src/preload'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  }
})
