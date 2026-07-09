import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    esbuild: {
      jsx: 'automatic',
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    }
  }
})
