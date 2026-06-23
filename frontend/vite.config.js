import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // Proxy /api/* to the Express backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      // These packages are loaded via <script> tags in index.html and expose
      // window.Hands / window.Camera as UMD globals.  Telling Rollup to treat
      // them as externals prevents double-bundling and WASM loading errors.
      external: ['@mediapipe/hands', '@mediapipe/camera_utils'],
      output: {
        globals: {
          '@mediapipe/hands':         'Hands',
          '@mediapipe/camera_utils':  'Camera',
        },
      },
    },
  },
})
