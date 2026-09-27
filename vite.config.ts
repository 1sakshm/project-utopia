import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Project Utopia',
        short_name: 'Utopia',
        description: 'Discover and play beautiful short games designed around memory, attention, rhythm, planning and calm.',
        theme_color: '#0b0d14',
        background_color: '#0b0d14',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Library', url: '/library' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,jpg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\/](three|@react-three|postprocessing|three-stdlib|maath|troika)/.test(id)) return 'engine-r3f';
            if (/[\/](pixi\.js|@pixi)[\/]/.test(id)) return 'engine-pixi';
          }
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: true },
});
