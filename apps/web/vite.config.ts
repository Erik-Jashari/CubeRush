import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// In development the API server runs separately (`npm run dev` starts both).
// API_PORT points the proxy at a server on another port, e.g. for a second local stack.
const api = { '/api': `http://127.0.0.1:${process.env.API_PORT ?? '3000'}` };

export default defineConfig({
  plugins: [
    react(),
    // Makes the built app installable and playable offline: a service worker keeps a copy of
    // the app's files. The API is never cached, so scores always come from the server.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'CubeRush',
        short_name: 'CubeRush',
        description: 'Solve a 3D Rubik’s cube against the clock, learn the beginner method.',
        theme_color: '#0d0f17',
        background_color: '#0d0f17',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // three.js makes the main bundle larger than Workbox's 2 MB default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Pages like /c/<code> are the app too, but /api is always the network.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: { port: 5173, proxy: api },
  preview: { proxy: api },
});
