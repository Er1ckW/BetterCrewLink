import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron({
      entry: 'src/main/index.ts',
      vite: {
        build: {
          outDir: 'dist-electron/main',
          rollupOptions: {
            external: ['electron', 'electron-overlay-window', 'registry-js', 'node:fs', 'node:path', 'node:os']
          }
        }
      }
    }),
    renderer({
      resolve: {
        electron: { type: 'cjs' }
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'src': path.resolve(__dirname, 'src')
    }
  }
})
