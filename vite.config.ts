import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' defers SW activation; our usePWA hook shows the update banner
      registerType: 'prompt',
      // null = no HTML script injected; useRegisterSW in usePWA.ts is the sole
      // registration path (one path, React-owned, matches PwaUpdatePrompt pattern)
      injectRegister: null,

      manifest: {
        name: 'Flashcards',
        short_name: 'Flashcards',
        description: 'A local-first flashcard study app',
        theme_color: '#0b0e14',
        background_color: '#0f1117',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/Icon-128.png',
            sizes: '128x128',
            type: 'image/png',
          },
          {
            src: 'icons/Icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/Icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/Maskable-128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/Maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/Maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Precache all build output JS/CSS/HTML + static assets in public/
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        // SPA navigation fallback — serves index.html for any unmatched navigation
        navigateFallback: 'index.html',
        // Don't apply the SPA fallback to static file paths
        navigateFallbackDenylist: [/^\/icons\//, /\.webmanifest$/],

        runtimeCaching: [
          // Supabase API + auth: network-only, never cache
          // Stale auth tokens or sync responses could silently corrupt local data
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
          // Google Fonts CSS: stale-while-revalidate (small file, changes rarely)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          // Google Fonts files: cache-first, versioned URLs won't change
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // Keep service workers out of dev — HMR and SW don't mix well
      devOptions: { enabled: false },
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-dexie':  ['dexie', 'dexie-react-hooks'],
          'vendor-charts': ['recharts'],
          'vendor-csv':    ['papaparse'],
          'vendor-forms':  ['react-hook-form'],
        },
      },
    },
  },
});
