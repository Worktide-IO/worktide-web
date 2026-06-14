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
    // Dev-only proxy: the Symfony backend lives under api.worktide.ddev.site
    // with a self-signed (well, mkcert-signed) cert + workspace-aware host
    // routing. Proxying /v1/* dodges CORS in dev and lets us point fetch
    // calls at the same origin. Production deploys point VITE_API_BASE
    // straight at the API subdomain.
    proxy: {
      '/v1': {
        target: 'https://api.worktide.ddev.site',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
