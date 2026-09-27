// Headless smoke test for Utopia games via the Game Lab.
// Usage: node scripts/smoke.mjs <gameId|all> [--port=5173] [--play-ms=9000]
// Requires the dev server running (npm run dev). Screenshots go to ./shots/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) ?? 'all';
const port = (args.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const playMs = Number((args.find((a) => a.startsWith('--play-ms=')) ?? '--play-ms=9000').split('=')[1]);
const base = `http://localhost:${port}`;
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});

async function ids() {
  if (target !== 'all') return target.split(',');
  const page = await browser.newPage();
  await page.goto(`${base}/lab`);
  await page.waitForSelector('li');
  const list = await page.$$eval('li a:first-of-type', (as) => as.map((a) => new URL(a.href).searchParams.get('game')));
  await page.close();
  return list;
}

const IGNORE = [/Download the React DevTools/, /GPU stall/, /WebGL: INVALID/, /Automatic fallback to software WebGL/, /THREE.WebGLRenderer: Context Lost/, /\[vite\]/];

async function runOne(id) {
  const result = { id, errors: [], preview: null, play: null };
  const ctx = await browser.newContext({ viewport: { width: 650, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) result.errors.push('console: ' + m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + String(e.stack ?? e).slice(0, 600)));

  // Preview (attract mode)
  await page.goto(`${base}/lab?game=${id}&mode=preview`);
  try {
    await page.waitForFunction(() => window.__labReady === true, null, { timeout: 20000 });
  } catch {
    result.errors.push('preview: not ready within 20s');
  }
  await page.waitForTimeout(5000);
  await page.locator('[data-testid=game-box]').screenshot({ path: `shots/${id}-preview.png` });
  result.preview = 'ok';

  // Play mode with random input
  await page.goto(`${base}/lab?game=${id}&mode=play`);
  try {
    await page.waitForFunction(() => window.__labReady === true, null, { timeout: 20000 });
    await page.click('[data-testid=lab-start]');
  } catch {
    result.errors.push('play: not ready within 20s');
  }
  const box = await page.locator('[data-testid=game-box]').boundingBox();
  const keys = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Digit1', 'Digit2', 'Digit3', 'Enter', 'KeyA', 'KeyD'];
  const t0 = Date.now();
  let shot = false;
  while (Date.now() - t0 < playMs) {
    const r = Math.random();
    const x = box.x + 20 + Math.random() * (box.width - 40);
    const y = box.y + 60 + Math.random() * (box.height - 120);
    if (r < 0.55) await page.mouse.click(x, y);
    else if (r < 0.7) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 200, { steps: 5 });
      await page.mouse.up();
    } else await page.keyboard.press(keys[Math.floor(Math.random() * keys.length)]);
    await page.waitForTimeout(150 + Math.random() * 250);
    if (!shot && Date.now() - t0 > playMs / 2) {
      shot = true;
      await page.locator('[data-testid=game-box]').screenshot({ path: `shots/${id}-play.png` });
    }
  }
  const hud = await page.locator('[data-testid=lab-hud]').textContent().catch(() => '');
  const summary = await page.locator('[data-testid=lab-summary]').textContent({ timeout: 500 }).catch(() => null);
  const labErrors = await page.locator('[data-testid=lab-errors]').textContent({ timeout: 500 }).catch(() => null);
  if (labErrors) result.errors.push('lab: ' + labErrors.slice(0, 1200));
  result.play = { hud: hud?.replace(/\s+/g, ' '), summary: summary?.replace(/\s+/g, ' ') ?? null };
  await ctx.close();
  return result;
}

const list = await ids();
let failed = 0;
for (const id of list) {
  const r = await runOne(id);
  if (r.errors.length) failed++;
  console.log(JSON.stringify(r, null, 1));
}
await browser.close();
console.log(failed ? `FAILED: ${failed}/${list.length} games had errors` : `OK: ${list.length} games passed`);
process.exit(failed ? 1 : 0);
