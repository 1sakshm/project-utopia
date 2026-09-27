// End-to-end smoke test of the platform flow: feed → play → pause → exit → same card; pages render.
// Usage: node scripts/app-smoke.mjs [--port=5173] [--desktop]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const port = (args.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const desktop = args.includes('--desktop');
const base = `http://localhost:${port}`;
mkdirSync('shots', { recursive: true });
const tag = desktop ? 'desk' : 'mob';

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(
  desktop ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/DevTools|GPU stall|WebGL: INVALID|software WebGL|Context Lost/.test(m.text()) && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.stack ?? e).slice(0, 500)));
const step = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, String(e).slice(0, 300));
    errors.push(`${name}: ${String(e).slice(0, 200)}`);
  }
};

await step('feed loads', async () => {
  await page.goto(base + '/');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(base + '/');
  await page.waitForSelector('.card');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `shots/app-${tag}-feed.png` });
});
await step('scroll to 2nd card', async () => {
  if (await page.locator('.coach').isVisible().catch(() => false)) await page.locator('.coach').click();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `shots/app-${tag}-feed2.png` });
});
let idxBefore = -1;
await step('play overlay opens', async () => {
  idxBefore = await page.evaluate(() => Math.round(document.querySelector('.feed').scrollTop / document.querySelector('.feed').clientHeight));
  const btn = page.locator(`.card[data-feed-index="${idxBefore}"] .card-play`);
  await btn.click();
  await page.waitForSelector('.play-overlay');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/app-${tag}-howto.png` });
  const go = page.locator('.howto .btn-primary');
  if (await go.isVisible().catch(() => false)) await go.click();
  await page.waitForTimeout(2500);
  const box = await page.locator('.play-box').boundingBox();
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(box.x + box.width * (0.2 + Math.random() * 0.6), box.y + box.height * (0.3 + Math.random() * 0.5));
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `shots/app-${tag}-playing.png` });
});
await step('pause menu', async () => {
  await page.locator('.play-top .icon-btn').nth(1).click();
  await page.waitForSelector('.pause');
  await page.screenshot({ path: `shots/app-${tag}-paused.png` });
});
await step('exit returns to same card', async () => {
  await page.locator('.pause .btn-ghost').click();
  await page.waitForSelector('.play-overlay', { state: 'detached' });
  await page.waitForTimeout(800);
  const idx = await page.evaluate(() => Math.round(document.querySelector('.feed').scrollTop / document.querySelector('.feed').clientHeight));
  if (idx !== idxBefore) throw new Error(`feed index ${idx} !== ${idxBefore}`);
  await page.screenshot({ path: `shots/app-${tag}-returned.png` });
});
for (const p of ['library', 'progress', 'settings', 'about', 'game/echo-garden']) {
  await step(`page /${p}`, async () => {
    await page.goto(`${base}/${p}`);
    await page.waitForSelector('.page');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `shots/app-${tag}-${p.replace('/', '-')}.png`, fullPage: false });
  });
}
await step('deep link /play/firefly-night', async () => {
  await page.goto(`${base}/play/firefly-night`);
  await page.waitForSelector('.play-overlay');
  await page.waitForTimeout(2500);
  await page.locator('.play-top .icon-btn').first().click();
  await page.waitForTimeout(800);
  if (!page.url().includes('card=firefly-night')) throw new Error('did not land on feed card: ' + page.url());
});

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'OK: no errors');
process.exit(errors.length ? 1 : 0);
