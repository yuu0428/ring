import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages はリポジトリ名のサブパスで配信されるため base を合わせる。
// ローカル開発とプレビューでは '/' を使う。
const base = process.env.GITHUB_ACTIONS ? '/ring/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Ring — 停める前に、撤去されるか調べる',
        short_name: 'Ring',
        description:
          'いま立っている場所に自転車を停めたら撤去されるのかを答えます。東京都のオープンデータを使用。',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0E1116',
        theme_color: '#0E1116',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,geojson}'],
        // データファイルは大きいので上限を上げる（オフライン動作は要件 FR-10）
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        runtimeCaching: [
          {
            // 地図タイルは取得できたぶんだけ残す。オフラインでは未取得範囲が空になる
            urlPattern: /^https:\/\/cyberjapandata\.gsi\.go\.jp\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gsi-tiles',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
