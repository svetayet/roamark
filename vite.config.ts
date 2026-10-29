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
          {
            // Относительный путь: манифест лежит в корне сайта, иконка тоже.
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
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
