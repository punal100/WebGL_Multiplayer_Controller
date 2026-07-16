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
    // Allow the Vite dev server to be reached through a Cloudflare Tunnel
    // (*.trycloudflare.com) and any other host. Vite blocks unknown Host
    // headers by default; without this, tunneled dev requests are rejected
    // with "Blocked request. This host ... is not allowed."
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:4567',
      '/socket.io': {
        target: 'http://localhost:4567',
        ws: true,
      },
    },
  },
});
