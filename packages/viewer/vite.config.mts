import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEV_API_TARGET = process.env.SES_MAIL_CATCHER_URL ?? 'http://127.0.0.1:8005';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs let the same bundle be served from any path prefix,
  // which is what the local server and the AWS viewer function both need.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': { target: DEV_API_TARGET, changeOrigin: true },
    },
  },
});
