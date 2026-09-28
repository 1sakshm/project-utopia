// Render marketing artboards (marketing/*.html) to PNGs in marketing/out/.
// Usage: node scripts/render-marketing.mjs [logo|banner|all]   (dev server must be running on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const which = process.argv[2] ?? 'all';
const base = 'http://localhost:5173/marketing';
mkdirSync('marketing/out', { recursive: true });

const jobs = [
  // LinkedIn profile/company logo: square, rendered at 2× for crispness (2160×2160) plus a 400×400 upload size.
  { key: 'logo', url: `${base}/logo.html`, w: 1080, h: 1080, scale: 2, out: 'utopia-logo-2160.png' },
  { key: 'logo', url: `${base}/logo.html`, w: 1080, h: 1080, scale: 400 / 1080, out: 'utopia-logo-400.png' },
  { key: 'logo', url: `${base}/logo.html#transparent`, w: 1080, h: 1080, scale: 1, out: 'utopia-mark-transparent-1080.png', transparent: true },
  // LinkedIn banner: 1584×396 (personal) rendered at 2× = 3168×792, plus exact size.
  { key: 'banner', url: `${base}/banner.html`, w: 1584, h: 396, scale: 2, out: 'utopia-linkedin-banner-3168x792.png' },
  { key: 'banner', url: `${base}/banner.html`, w: 1584, h: 396, scale: 1, out: 'utopia-linkedin-banner-1584x396.png' },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
for (const j of jobs.filter((j) => which === 'all' || j.key === which)) {
  const ctx = await browser.newContext({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.scale });
  const page = await ctx.newPage();
  await page.goto(j.url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.locator('#art').screenshot({ path: `marketing/out/${j.out}`, omitBackground: !!j.transparent });
  console.log('rendered', j.out);
  await ctx.close();
}
await browser.close();
