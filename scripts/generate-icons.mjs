// Генерация PNG-иконок PWA из public/icon.svg.
// Chromium считает приложение устанавливаемым только при наличии PNG 192x192 и
// 512x512 в манифесте (SVG с sizes:"any" критерий не проходит), поэтому PNG
// коммитятся в public/ и лежат рядом с исходным SVG.
// Запуск: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svgPath = new URL('../public/icon.svg', import.meta.url);
const svg = readFileSync(svgPath, 'utf8');

// Обычные иконки — как нарисовано: скруглённый зелёный квадрат с прозрачными углами.
for (const size of [192, 512]) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const out = new URL(`../public/pwa-${size}.png`, import.meta.url);
  writeFileSync(out, resvg.render().asPng());
  console.log(`pwa-${size}.png готова`);
}

// Маскируемая иконка: фон на весь квадрат (Android обрезает по форме лаунчера),
// рисунок ужат до безопасной зоны — внутренних ~78% квадрата.
const inner = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
if (!inner) throw new Error('Не удалось извлечь содержимое icon.svg');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0F6B51"/>
  <g transform="translate(256 256) scale(0.78) translate(-256 -256)">${inner}</g>
</svg>`;
const maskableResvg = new Resvg(maskable, { fitTo: { mode: 'width', value: 512 } });
writeFileSync(new URL('../public/pwa-maskable-512.png', import.meta.url), maskableResvg.render().asPng());
console.log('pwa-maskable-512.png готова');
