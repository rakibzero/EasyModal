import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Proxy API calls to the local backend in dev
      '/api': 'http://127.0.0.1:7421',
    },
  },
});
