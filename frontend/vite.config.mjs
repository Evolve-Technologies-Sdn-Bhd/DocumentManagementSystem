import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import os from 'node:os'

const cpuCount = os.cpus().length
const maxWorkers = Math.max(1, Math.min(cpuCount - 1, 2))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@mui\/material\/(.+)$/,
        replacement: path.resolve(__dirname, 'node_modules/@mui/material/esm') + '/$1'
      }
    ]
  },
  build: {
    target: 'es2019',
    cssCodeSplit: true,
    minify: 'esbuild',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      maxParallelFileOps: maxWorkers,
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react'
            if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui'
            if (id.includes('chart.js') || id.includes('react-chartjs')) return 'charts'
            if (id.includes('docx-preview') || id.includes('mammoth')) return 'office'
            if (id.includes('jspdf') || id.includes('jspdf-autotable') || id.includes('html2canvas')) return 'pdf'
            if (id.includes('datatables')) return 'vendor-datatables'
            if (id.includes('axios') || id.includes('dompurify') || id.includes('nanoid') || id.includes('react-markdown') || id.includes('remark')) return 'vendor-utils'
          }
        },
        experimentalMinChunkSize: 20000
      }
    }
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
