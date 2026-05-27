import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    // Pinned port — Vite's default 5173/5174 is commonly taken by Docker
    // Desktop's helper containers, which makes Electron's renderer hit
    // Docker's HTTP responder and show a blank screen on launch. 5189 is
    // far enough from the well-known Vite range to dodge that collision;
    // `strictPort: false` (Vite's default) still lets it roll forward if
    // 5189 itself is ever taken.
    server: { port: 5189 },
    build: {
      // The Monaco editor chunk is intentionally large and lazy-loaded.
      chunkSizeWarningLimit: 8000,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
