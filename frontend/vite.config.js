import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import mkcert from 'vite-plugin-mkcert'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [react(), mkcert()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '0.0.0.0', // 监听局域网
    https: true,     // 启用 HTTPS
    proxy: {
      '/api': {
        target: 'http://localhost:3198',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react-core';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'recharts';
          }
          if (id.includes('node_modules/exceljs') || id.includes('node_modules/jspdf') || id.includes('node_modules/file-saver')) {
            return 'export-utils';
          }
        }
      }
    },
    chunkSizeWarningLimit: 800
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/hooks/**', 'src/components/**'],
      reporter: ['text', 'html', 'json']
    }
  }
})
