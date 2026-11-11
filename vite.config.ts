import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022'
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8764',
      '/health': 'http://127.0.0.1:8764',
      '/downloads': 'http://127.0.0.1:8764'
    }
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'chrome-extension/**', 'android/**', 'dist-artifacts/**'],
    environment: 'node'
  }
});
