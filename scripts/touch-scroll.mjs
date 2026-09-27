// Mobile touch-swipe test for the feed: swipes up with real touch events (CDP) and checks the card changes.
// Usage: node scripts/touch-scroll.mjs [--port=5173]
import { chromium } from 'playwright';

const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/`);
await page.evaluate(() => {
  sessionStorage.clear();
  localStorage.setItem('utopia.coach', '1');
});
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('.card');
await page.waitForTimeout(4000); // let the live preview mount on card 0
const cdp = await ctx.newCDPSession(page);

async function swipe(x, y0, y1) {
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1200);
}
const idx = () => page.evaluate(() => Math.round(document.querySelector('.feed').scrollTop / document.querySelector('.feed').clientHeight));

let fails = 0;
// Swipe starting on the live preview area (upper-middle of the card).
for (const [label, y0, y1, delta = 1] of [
  ['swipe on preview (card 0 → 1)', 420, 120],
  ['swipe on preview (card 1 → 2)', 420, 120],
  ['swipe on text/meta area (card 2 → 3)', 640, 300],
  ['swipe down goes back (card 3 → 2)', 200, 520, -1],
  ['tiny drag stays put (card 2)', 420, 400, 0],
]) {
  const before = await idx();
  await swipe(195, y0, y1);
  const after = await idx();
  const ok = after === before + delta;
  if (!ok) fails++;
  console.log(ok ? '✓' : '✗', label, `index ${before} → ${after}`);
}
await browser.close();
console.log(fails ? `FAILED ${fails}` : 'OK');
process.exit(fails ? 1 : 0);
