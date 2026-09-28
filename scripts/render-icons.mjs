// Render the PWA / home-screen icons from public/icon.svg + public/icon-maskable.svg into PNGs.
// Usage: node scripts/render-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const jobs = [
  { svg: 'public/icon.svg', size: 192, out: 'public/icon-192.png', transparent: true },
  { svg: 'public/icon.svg', size: 512, out: 'public/icon-512.png', transparent: true },
  { svg: 'public/icon-maskable.svg', size: 512, out: 'public/icon-maskable-512.png' },
  // iOS applies its own rounded mask and ignores transparency, so use the full-bleed art.
  { svg: 'public/icon-maskable.svg', size: 180, out: 'public/apple-touch-icon.png' },
];
const browser = await chromium.launch();
for (const j of jobs) {
  const page = await (await browser.newContext({ viewport: { width: j.size, height: j.size } })).newPage();
  const svg = readFileSync(j.svg, 'utf8');
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${j.size}" height="${j.size}" style="display:block"></body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: j.out, omitBackground: !!j.transparent });
  console.log('rendered', j.out);
}
await browser.close();
