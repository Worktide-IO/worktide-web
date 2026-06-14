import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow the DDEV-router hostname (and any *.ddev.site sibling) to reach
    // Vite — modern Vite blocks unknown Host headers by default.
    allowedHosts: ['.ddev.site', 'localhost'],
    // HMR happens via the standard HTTPS port that ddev-router exposes.
    // Without this, the browser would try to connect WebSocket on :5173,
    // which is the CONTAINER port (not reachable from the host).
    hmr: {
      protocol: 'wss',
      host: 'worktide-web.ddev.site',
      clientPort: 443,
    },
    // Dev-only proxy: the Symfony backend sits at api.worktide.ddev.site with
    // a workspace-aware host routing and an mkcert-signed cert. Proxying
    // /v1/* dodges CORS in dev and lets fetch calls stay same-origin.
    // Production deploys point VITE_API_BASE straight at the real API host.
    proxy: {
      '/v1': {
        target: 'https://api.worktide.ddev.site',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
