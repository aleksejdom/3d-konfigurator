import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Zwei Seiten: der Editor (index.html) und die separat ladbare Webvorschau (preview.html).
export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', preview: 'preview.html' } },
  },
});
