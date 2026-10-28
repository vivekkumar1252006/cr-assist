import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@student': resolve(__dirname, './src/student'),
      '@admin': resolve(__dirname, './src/admin'),
      '@shared': resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: 8080,
    host: true,
    allowedHosts: ['bride-shrunk-congress.ngrok-free.dev', 'localhost', '127.0.0.1', '.loca.lt', '.ngrok-free.dev', '.ngrok-free.app'],
    proxy: {
      // 127.0.0.1 avoids the IPv6/IPv4 "localhost" mismatch on Windows.
      '/api': 'http://127.0.0.1:5000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Student app pages
          if (id.includes('/src/student/pages/')) {
            return 'student-pages';
          }
          // Admin app pages
          if (id.includes('/src/admin/pages/')) {
            return 'admin-pages';
          }
          // Shared components
          if (id.includes('/src/shared/components/')) {
            return 'shared-components';
          }
          // Vendor
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});