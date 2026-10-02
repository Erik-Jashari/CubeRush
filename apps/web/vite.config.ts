import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API server runs separately (`npm run dev` starts both).
// API_PORT points the proxy at a server on another port, e.g. for a second local stack.
const api = { '/api': `http://127.0.0.1:${process.env.API_PORT ?? '3000'}` };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: api },
  preview: { proxy: api },
});
