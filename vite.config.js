import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 4567,
    proxy: {
      '/api': 'http://localhost:4567',
      '/socket.io': {
        target: 'http://localhost:4567',
        ws: true,
      },
    },
  },
});
