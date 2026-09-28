// Capture deterministic 30fps footage of each game's attract mode (virtual clock → perfect frame pacing).
// Usage: node scripts/capture-clips.mjs [ids,comma] [--frames=90] [--warmup=2500]
// Output: marketing/out/clips/<id>/0000.jpg … (dev server must be running on :5173)
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const frames = Number((args.find((a) => a.startsWith('--frames=')) ?? '--frames=90').split('=')[1]);
const warmup = Number((args.find((a) => a.startsWith('--warmup=')) ?? '--warmup=2500').split('=')[1]);
const ids = only
  ? only.split(',')
  : ['echo-garden', 'lantern-lake', 'tidal-beat', 'stonepath', 'zenith', 'lumen', 'orbit-keeper', 'prism-sort', 'upstream', 'still-water', 'glyphfield', 'shoal', 'firefly-night', 'starback'];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
for (const id of ids) {
  const dir = `marketing/out/clips/${id}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [${id}] pageerror`, e.message));
  await page.clock.install({ time: new Date('2026-09-28T20:00:00Z') });
  // 'load' never fires under the fake clock; DOMContentLoaded is enough.
  await page.goto(`http://localhost:5173/lab?game=${id}&mode=preview&seed=7`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'aside{display:none !important}';
    document.head.appendChild(st);
  });
  // Wait for the game to mount while advancing virtual time (real-time polling would stall under the fake clock).
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    await page.clock.runFor(50);
    ready = await page.evaluate(() => window.__labReady === true);
    if (!ready) await page.waitForTimeout(50);
  }
  if (!ready) {
    console.log(`  [${id}] not ready, skipping`);
    await ctx.close();
    continue;
  }
  for (let t = 0; t < warmup; t += 100) await page.clock.runFor(100);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.clock.runFor(1000 / 30);
    // Read pixels straight from the game canvas (preview mode preserves the drawing buffer).
    // Screenshots can't be used: Chromium's capture waits for a frame the fake clock never schedules.
    const url = await page.evaluate(() => document.querySelector('[data-testid=game-box] canvas')?.toDataURL('image/jpeg', 0.9) ?? '');
    if (!url) throw new Error('no canvas for ' + id);
    writeFileSync(`${dir}/${String(f).padStart(4, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`captured ${id}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await ctx.close();
}
await browser.close();
