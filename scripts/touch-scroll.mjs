// Mobile touch-swipe test for the feed: swipes up with real touch events (CDP) and checks the card changes.
// Usage: node scripts/touch-scroll.mjs [--port=5173]
import { chromium } from 'playwright';

const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
// Pass 1 (live WebGL previews): correct card + no reversal. Software WebGL makes frames slow, so timing isn't judged.
// Pass 2 (still previews): also require the release animation to settle within 500ms.
for (const [previewStyle, judgeTiming] of [['live', false], ['still', true]]) {
console.log(`— pass: ${previewStyle} previews`);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/`);
await page.evaluate((ps) => { window.__ps = ps;
  sessionStorage.clear();
  localStorage.setItem('utopia.coach', '1');
  localStorage.setItem('utopia.settings', JSON.stringify({ state: { previewStyle: window.__ps }, version: 1 }));
}, previewStyle);
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
  // Record scrollTop every frame for 700ms after release to catch stutter (reversals / stalls / slow settle).
  const trace = page.evaluate(() => new Promise((res) => {
    const f = document.querySelector('.feed'); const out = []; const t0 = performance.now();
    const tick = () => { out.push([performance.now() - t0, f.scrollTop]); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const pts = await trace;
  await page.waitForTimeout(400);
  return pts;
}
function smooth(pts) {
  const dir = Math.sign(pts[pts.length - 1][1] - pts[0][1]);
  let reversal = 0, settledAt = null;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i][1] - pts[i - 1][1];
    if (dir && Math.sign(d) === -dir && Math.abs(d) > 2) reversal = Math.max(reversal, Math.abs(d));
  }
  const end = pts[pts.length - 1][1];
  for (const [t, y] of pts) if (settledAt === null && Math.abs(y - end) < 1) settledAt = t;
  return { reversal, settledMs: Math.round(settledAt ?? 999) };
}
const idx = () => page.evaluate(() => Math.round(document.querySelector('.feed').scrollTop / document.querySelector('.feed').clientHeight));

// Swipe starting on the live preview area (upper-middle of the card).
for (const [label, y0, y1, delta = 1] of [
  ['swipe on preview (card 0 → 1)', 420, 120],
  ['swipe on preview (card 1 → 2)', 420, 120],
  ['swipe on text/meta area (card 2 → 3)', 640, 300],
  ['swipe down goes back (card 3 → 2)', 200, 520, -1],
  ['tiny drag stays put (card 2)', 420, 400, 0],
]) {
  const before = await idx();
  const pts = await swipe(195, y0, y1);
  const after = await idx();
  const sm = smooth(pts);
  const ok = after === before + delta && sm.reversal === 0 && (!judgeTiming || sm.settledMs < 500);
  if (!ok) fails++;
  console.log(ok ? '✓' : '✗', label, `index ${before} → ${after}`, `settled ${sm.settledMs}ms`, sm.reversal ? `REVERSAL ${sm.reversal}px` : 'no reversal');
}
await ctx.close();
}
await browser.close();
console.log(fails ? `FAILED ${fails}` : 'OK');
process.exit(fails ? 1 : 0);
