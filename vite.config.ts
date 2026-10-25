import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// base './' lets the built app work from a GitHub Pages sub-path (user.github.io/courseify/).
export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // Fonts (the chess pieces among them) and the course chunks must work offline too.
      // The chess engine (7 MB) is too big to download with the app; it is kept once first used.
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        // Python (12 MB) is only downloaded by people who run Python code, then kept.
        globIgnores: ['**/pyodide/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/pyodide/'),
            handler: 'CacheFirst',
            options: { cacheName: 'python', expiration: { maxEntries: 12 } }
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm') || url.pathname.endsWith('/sql/sql-worker.js'),
            handler: 'CacheFirst',
            options: { cacheName: 'chess-engine', expiration: { maxEntries: 4 } }
          }
        ]
      },
      manifest: {
        name: 'Courseify',
        short_name: 'Courseify',
        description: 'Free, offline-first courses on any topic, with mastery tracking and practice.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
