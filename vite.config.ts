/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages для репозитория-проекта живёт на под-пути /<repo>/ — базу задаёт CI через VITE_BASE.
  // Репозиторий вида <user>.github.io собирается с базой '/' (CI сам подставляет).
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'roaMark',
        short_name: 'roaMark',
        lang: 'ru',
        display: 'standalone',
        theme_color: '#0F6B51',
        background_color: '#F0F3F1',
        icons: [
          // PNG 192/512 обязательны для «устанавливаемости» в Chromium:
          // один SVG с sizes:"any" критерий установки не проходит.
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          // Отдельная маскируемая: Android обрезает иконку по форме лаунчера.
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          // Вектор остаётся для вкладок и закладок.
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
  },
});
