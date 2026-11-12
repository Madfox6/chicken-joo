import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/chicken-joo/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: '/chicken-joo/',
        name: 'Chicken Joo Staff',
        short_name: 'Chicken Joo',
        description: 'Clock in, count stock, and see your pay.',
        theme_color: '#c5362b',
        background_color: '#f3efe6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/chicken-joo/',
        scope: '/chicken-joo/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/xbvqeoxbfjlgmkwqfvms\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: ['es2020', 'chrome80', 'safari14'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
