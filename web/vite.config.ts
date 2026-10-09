import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In development `/api` and `/auth` are proxied to the server so cookies stay same-origin.
// Production builds can point elsewhere with VITE_API_URL (see src/api/client.ts).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
      '/auth': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
