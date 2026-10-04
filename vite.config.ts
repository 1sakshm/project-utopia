import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { handleSTT, handleTTS } from './api/_sarvam.ts';

/** Dev-only: serve /api/tts and /api/stt locally (same handlers as the Vercel functions). Key from .env.local. */
function sarvamDevApi(key: string | undefined): Plugin {
  return {
    name: 'utopia-sarvam-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path !== '/api/tts' && path !== '/api/stt') return next();
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          });
          const out = await (path === '/api/tts' ? handleTTS(request, key) : handleSTT(request, key));
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    sarvamDevApi(loadEnv(mode, process.cwd(), '').SARVAM_API_KEY),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
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
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [{ name: 'Library', url: '/library' }],
      },
      workbox: {
        // Precache only the app shell. The 3D/2D engines, each game and the posters are cached the first time they're
        // used (so played games still work offline) instead of downloading everything on the first visit.
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        globIgnores: ['**/engine-*.js', '**/game-*.js', 'posters/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
            handler: 'CacheFirst',
            options: { cacheName: 'utopia-code', expiration: { maxEntries: 80 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/posters/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'utopia-posters', expiration: { maxEntries: 120 } },
          },
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
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
}));
