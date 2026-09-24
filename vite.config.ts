import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/core/language/') || id.includes('/src/lookup/normalization/') || /\/src\/lookup\/(?:localAssets|localLexeme|learnedLexicon)\./.test(id)) return 'local-language';
          if (id.includes('node_modules/pdfjs-dist')) return 'pdf-reader';
          if (id.includes('node_modules/tesseract.js')) return 'ocr-reader';
          if (id.includes('node_modules/jszip') || id.includes('node_modules/@xmldom')) return 'archive-runtime';
          if (id.includes('node_modules/epubjs')) return 'epub-reader';
          if (id.includes('node_modules/mammoth')) return 'docx-reader';
        }
      }
    }
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'Context Lens',
        short_name: 'Context Lens',
        description: 'Fast contextual English reading for Vietnamese learners',
        theme_color: '#f8f7f3',
        background_color: '#f8f7f3',
        display: 'standalone',
        id: '/',
        scope: '/',
        start_url: '/',
        lang: 'en',
        categories: ['education', 'books'],
        share_target: {
          action: '/?share-target=1',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' }
        },
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'assets/context-lens-en-vi-*.json', 'assets/wordnet-*.json', 'assets/WORDNET-LICENSE-*.md', 'assets/ATTRIBUTION-*.md'],
        globIgnores: ['**/pdf-reader-*.js', '**/ocr-reader-*.js', '**/ocr/**', '**/epub-reader-*.js', '**/docx-reader-*.js', '**/archive-runtime-*.js'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'context-lens-ocr-assets', expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 } }
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\/assets\/.*\.(?:js|mjs)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'context-lens-reader-chunks', expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 } }
          }
        ],
        cleanupOutdatedCaches: true
      }
    })
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'gateway/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts']
  }
});
