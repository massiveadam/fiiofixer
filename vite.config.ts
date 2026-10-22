import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'third-party-notices.txt'],
    manifest: {
      name: 'FiiOFixer', short_name: 'FiiOFixer', description: 'EQ editor for FiiO EH11 headphones.',
      id: '.', start_url: '.', scope: '.', display: 'standalone',
      theme_color: '#eaf0f5', background_color: '#eaf0f5',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
      navigateFallbackDenylist: [/\/api\//],
      // Bluetooth sessions, tokens, and replies must always come from the live helper.
      runtimeCaching: [],
    },
  })],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
