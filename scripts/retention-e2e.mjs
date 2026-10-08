// End-to-end test of the retention features: Today's 3 card → three daily games in a row → share,
// mastery stars on results, "Up next" suggestion, and the landing page. Needs the DEV server (test hooks).
// Usage: node scripts/retention-e2e.mjs [--port=5173]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const base = `http://localhost:${port}`;
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/DevTools|GPU stall|WebGL: INVALID|software WebGL|Context Lost|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.stack ?? e).slice(0, 500)));
const step = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, String(e).slice(0, 1500));
    errors.push(`${name}: ${String(e).slice(0, 200)}`);
  }
};
// Screenshots are best-effort: some WebGL games keep the compositor busy in headless mode.
const snap = (path) => page.screenshot({ path, timeout: 20000 }).catch(() => console.log('  (screenshot skipped)', path));
const endRun = (score, level = 5) => page.evaluate(([score, level]) => window.__utopiaPlay.end({ score, levelReached: level, stats: {} }), [score, level]);
const waitHook = async () => {
  const id = () => new URL(page.url()).pathname.split('/').pop();
  await page.waitForFunction((gid) => window.__utopiaPlay?.id === gid, id());
  await page.waitForTimeout(1200);
};

await step('returning player sees Today’s 3 first', async () => {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('utopia.coach', '1');
    localStorage.setItem('utopia.settings', JSON.stringify({ state: { showBoostPicker: false }, version: 2 }));
    const g = { best: 10, bestRelaxed: 0, bestStats: {}, highestLevel: 2, lastLevel: 2, sessions: 1, playMs: 1, tutorialDone: true, lastPlayed: Date.now(), favorite: false, earlyExits: 0, dailyBest: null, storage: {} };
    localStorage.setItem('utopia.progress', JSON.stringify({ state: { games: { 'zenith': g }, history: [] }, version: 1 }));
  });
  await page.goto(base + '/feed', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card-today[data-feed-index="0"]');
  await page.waitForTimeout(1500);
  await snap('shots/ret-today.png');
});

const trio = [];
await step('play all three daily games in a row', async () => {
  // Tutorials would interrupt; mark all three as done first.
  const ids = await page.$$eval('.today-game', (els) => els.map((e) => e.getAttribute('aria-label')));
  if (ids.length !== 3) throw new Error('expected 3 games, got ' + ids.length);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('utopia.progress'));
    for (const id of ['echo-garden','firefly-night','sound-sleuth','lantern-lake','tidal-beat','story-shells','stonepath','glyphfield','word-echo','zenith','rhyme-tide','luna-says','silhouette','upstream','say-it-back','word-current','two-voices','starback','night-harbor','lingo-switch','lumen','glimpse','digit-echo','shoal','orbit-keeper','name-rush','prism-sort','loom','voice-sprint'])
      raw.state.games[id] = { ...(raw.state.games[id] ?? { best: 0, bestRelaxed: 0, bestStats: {}, highestLevel: 0, lastLevel: 0, sessions: 0, playMs: 0, lastPlayed: 0, favorite: false, earlyExits: 0, dailyBest: null, storage: {} }), tutorialDone: true };
    localStorage.setItem('utopia.progress', JSON.stringify(raw));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card-today');
  await page.click('.today-actions .btn-primary');
  for (let i = 0; i < 3; i++) {
    await waitHook();
    trio.push(new URL(page.url()).pathname);
    if (!page.url().includes('daily=1')) throw new Error('not a daily run: ' + page.url());
    await endRun(300 + i * 100, 4 + i);
    await page.waitForSelector('.results-trio');
    const label = await page.textContent('.results-trio');
    if (!label.includes(i < 2 ? `${i + 1} of 3` : 'complete')) throw new Error(`trio label at ${i}: ${label}`);
    if (i === 0) {
      await page.waitForTimeout(1600);
      await snap('shots/ret-results-1of3.png');
    }
    if (i < 2) await page.click('.results-actions .btn-primary');
  }
  if (new Set(trio).size !== 3) throw new Error('games repeated: ' + trio.join());
  await page.waitForTimeout(1600);
  await snap('shots/ret-results-complete.png');
});

await step('share copies a spoiler-free summary', async () => {
  await page.evaluate(() => {
    // Headless has no share sheet: force the clipboard path.
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.click('.results-trio .btn');
  await page.waitForFunction(() => document.querySelector('.results-trio .btn')?.textContent?.includes('Copied'));
  const text = await page.evaluate(() => navigator.clipboard.readText());
  if (!text.includes("Today's 3") || !text.includes('playutopia.pages.dev')) throw new Error('bad share text: ' + text);
});

await step('stars and up-next on a normal run', async () => {
  await page.goto(base + '/play/stonepath', { waitUntil: 'domcontentloaded' });
  await waitHook();
  await endRun(500, 7);
  await page.waitForSelector('.results-stars');
  const stars = await page.textContent('.results-stars');
  if (!stars.includes('★★★')) throw new Error('expected 3 stars: ' + stars);
  const next = await page.textContent('.results-next');
  if (!next.includes('Up next')) throw new Error('no up-next: ' + next);
  await page.click('.results-next');
  await page.waitForFunction(() => !location.pathname.includes('stonepath'));
});

await step('feed Today card shows complete + progress stars', async () => {
  await page.goto(base + '/feed', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card-today');
  const t = await page.textContent('.card-today');
  if (!t.includes('All three, done')) throw new Error('today card not complete');
  await page.goto(base + '/progress', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pr-star-card');
  await page.waitForTimeout(1200);
});

await step('landing page renders with CTA', async () => {
  await page.goto(base + '/welcome', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.lp-title');
  await page.click('.lp-ctas .btn-primary');
  await page.waitForFunction(() => location.pathname === '/feed');
});

console.log(errors.length ? `\n${errors.length} problem(s):\n` + errors.join('\n') : '\nAll retention checks passed.');
await browser.close();
process.exit(errors.length ? 1 : 0);
