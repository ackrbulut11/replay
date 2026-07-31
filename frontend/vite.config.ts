import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  },
  // `vite preview` (npm run preview) `server.proxy`'yi miras almaz; onsuz
  // /api/* istekleri backend'e değil statik sunucuya gider ve SPA fallback
  // index.html döndürür ("Unexpected token '<'... is not valid JSON").
  preview: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
