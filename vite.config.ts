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
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,png}'] },
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
