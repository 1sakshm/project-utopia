// Capture a poster frame for every game from its live preview (attract mode) into public/posters/<id>.jpg.
// Usage: node scripts/capture-posters.mjs [ids,comma,separated] [--port=5173] [--wait=6000]
// Requires the dev server. Posters are the fallback shown before a runtime preview frame is cached.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const port = (args.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const wait = Number((args.find((a) => a.startsWith('--wait=')) ?? '--wait=6000').split('=')[1]);
const base = `http://localhost:${port}`;
mkdirSync('public/posters', { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 650, height: 693 }, deviceScaleFactor: 1.5 })).newPage();
let ids = only ? only.split(',') : null;
if (!ids) {
  await page.goto(`${base}/lab`);
  await page.waitForSelector('li');
  ids = await page.$$eval('li a:first-of-type', (as) => as.map((a) => new URL(a.href).searchParams.get('game')));
}
for (const id of ids) {
  await page.goto(`${base}/lab?game=${id}&mode=preview`);
  await page.waitForFunction(() => window.__labReady === true, null, { timeout: 30000 });
  await page.waitForTimeout(wait);
  await page.locator('[data-testid=game-box]').screenshot({ path: `public/posters/${id}.jpg`, type: 'jpeg', quality: 78 });
  console.log('captured', id);
}
await browser.close();
