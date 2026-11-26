import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Model weights (~711 MB) are never precached — they're cached by WebLLM via Cache API.
// Workbox only precaches the app shell, data files, wasm, and fonts.
const WEIGHT_PATTERN = /weights\/.*\.(bin|safetensors|wasm)$/;

export default defineConfig({
  base: process.env.BASE_URL ?? '/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',

      manifest: {
        name: 'Séance: Dead Tongues',
        short_name: 'Dead Tongues',
        description: 'The ghost of SNOBOL4 answers from the beyond — offline, in your browser.',
        theme_color: '#0d0d12',
        background_color: '#0d0d12',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        // WebLLM bundles exceed Workbox's default 2 MB cap — raise to 15 MB.
        // Model weights (~711 MB) are still excluded via globIgnores below.
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,

        // Precache everything Vite emits EXCEPT model weight files
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm,json}'],
        globIgnores: [WEIGHT_PATTERN.source, '**/node_modules/**'],

        // Runtime cache for CDN fonts (fallback) — never model weights
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],

        // Don't let Workbox touch anything that looks like a model weight
        navigateFallbackDenylist: [WEIGHT_PATTERN],
      },
    }),
  ],

  // Workers must be ES modules so Vite can tree-shake and bundle them correctly
  worker: { format: 'es' },

  build: {
    target: 'esnext',   // required for top-level await in workers
    sourcemap: false,
  },
});
