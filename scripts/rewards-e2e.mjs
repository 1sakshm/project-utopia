// End-to-end test of the rewards system: boost picker → run → second chance (mock ad) → results rewards
// (double orbs via mock ad) → honest bests → quests on Progress → shop buy/equip. Needs the DEV server (test hooks).
// Usage: node scripts/rewards-e2e.mjs [--port=5173]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const base = `http://localhost:${port}`;
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
const eco = () => page.evaluate(() => JSON.parse(localStorage.getItem('utopia.economy') ?? '{}').state ?? {});
const prog = (id) => page.evaluate((id) => JSON.parse(localStorage.getItem('utopia.progress') ?? '{}').state?.games?.[id] ?? {}, id);
const watchAd = async () => {
  await page.waitForSelector('.ad-host');
  await page.waitForSelector('.ad-foot .btn-primary:not([disabled])', { timeout: 9000 });
  await page.click('.ad-foot .btn-primary');
  await page.waitForSelector('.ad-host', { state: 'detached' });
};
const GAME = 'echo-garden';

await step('fresh profile with tutorial done', async () => {
  await page.goto(base + '/');
  await page.evaluate((id) => {
    localStorage.clear();
    const games = { [id]: { best: 500, bestRelaxed: 0, bestStats: {}, highestLevel: 3, lastLevel: 3, sessions: 1, playMs: 60000, tutorialDone: true, lastPlayed: Date.now(), favorite: false, earlyExits: 0, dailyBest: null, storage: {} } };
    localStorage.setItem('utopia.progress', JSON.stringify({ state: { games, history: [] }, version: 1 }));
  }, GAME);
});

await step('boost picker shows, buy slow-mo with orbs', async () => {
  await page.goto(`${base}/play/${GAME}`);
  await page.waitForSelector('.boost-card');
  await page.screenshot({ path: 'shots/rw-picker.png' });
  const e0 = await eco();
  if (e0.orbs !== undefined && e0.orbs !== 50) throw new Error('unexpected start orbs ' + e0.orbs);
  // Second Wind: 1 in inventory. Slow-mo: 1 in inventory too; select both.
  await page.click('.boost:nth-child(1)');
  await page.click('.boost:nth-child(2)');
  if ((await page.locator('.boost[aria-pressed="true"]').count()) !== 2) throw new Error('boosts not selected');
  await page.click('.boost-card .btn-primary');
  await page.waitForSelector('.boost-card', { state: 'detached' });
  const e = await eco();
  if (e.boosts.slowmo !== 0 || e.boosts.secondWind !== 0) throw new Error('inventory not consumed ' + JSON.stringify(e.boosts));
});

await step('pre-loaded second wind auto-grants', async () => {
  await page.waitForFunction(() => !!window.__utopiaPlay);
  await page.waitForTimeout(1500);
  const granted = await page.evaluate(() => window.__utopiaPlay.revive());
  if (granted !== true) throw new Error('second wind not granted');
  if (await page.locator('.revive').isVisible().catch(() => false)) throw new Error('sheet shown despite second wind');
});

await step('assisted run: results show boosted pill and bests stay honest', async () => {
  await page.evaluate(() => window.__utopiaPlay.end({ score: 900, levelReached: 6, stats: {} }));
  await page.waitForSelector('.results');
  await page.waitForSelector('.boosted-pill');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/rw-results-boosted.png' });
  const p = await prog(GAME);
  if (p.best !== 500) throw new Error('normal best overwritten: ' + p.best);
  if (p.bestAssisted !== 900) throw new Error('bestAssisted not saved: ' + p.bestAssisted);
});

await step('double orbs via mock ad', async () => {
  const before = (await eco()).orbs;
  const btn = page.locator('.double-btn');
  await btn.click();
  await watchAd();
  await page.waitForSelector('.double-btn', { state: 'detached' });
  const after = (await eco()).orbs;
  if (after <= before) throw new Error(`orbs not doubled ${before} → ${after}`);
  const ads = (await eco()).ads;
  if (ads.count !== 1) throw new Error('ad not counted');
});

await step('play again: no picker, second chance sheet with ad', async () => {
  await page.click('.results .btn-primary');
  await page.waitForSelector('.results', { state: 'detached' });
  if (await page.locator('.boost-card').isVisible().catch(() => false)) throw new Error('picker shown on replay');
  await page.waitForTimeout(2000);
  const p = page.evaluate(() => window.__utopiaPlay.revive());
  await page.waitForSelector('.revive');
  await page.screenshot({ path: 'shots/rw-revive.png' });
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
  if (!/No thanks/.test(focused)) throw new Error('No thanks not focused: ' + focused);
  await page.click('.revive .btn-primary');
  await page.waitForSelector('.ad-host');
  await page.screenshot({ path: 'shots/rw-ad.png' });
  await watchAd();
  if ((await p) !== true) throw new Error('revive not granted after ad');
  await page.waitForSelector('.revive', { state: 'detached' });
});

await step('declined/dismissed flows resolve false', async () => {
  await page.click('.play-top .icon-btn >> nth=0'); // exit
  await page.waitForTimeout(800);
  await page.goto(`${base}/play/${GAME}`);
  await page.waitForSelector('.boost-card');
  await page.click('.boost-card .btn-primary'); // plain play
  await page.waitForFunction(() => !!window.__utopiaPlay);
  await page.waitForTimeout(1500);
  const p = page.evaluate(() => window.__utopiaPlay.revive());
  await page.waitForSelector('.revive');
  await page.click('.revive .btn-primary'); // watch ad…
  await page.waitForSelector('.ad-host');
  await page.click('.ad-skip'); // …but skip it: no reward, sheet stays
  await page.waitForSelector('.ad-host', { state: 'detached' });
  await page.waitForSelector('.revive');
  await page.click('.revive .btn-ghost');
  if ((await p) !== false) throw new Error('decline should resolve false');
  await page.evaluate(() => window.__utopiaPlay.end({ score: 700, levelReached: 5, stats: {} }));
  await page.waitForSelector('.results');
  if (await page.locator('.boosted-pill').count()) throw new Error('unassisted run marked boosted');
  const pr = await prog(GAME);
  if (pr.best !== 700) throw new Error('normal best not updated: ' + pr.best);
});

await step('progress page: profile card and quests', async () => {
  await page.goto(`${base}/progress`);
  await page.waitForSelector('.pf-card');
  await page.waitForTimeout(1200);
  const n = await page.locator('.pf-quest').count();
  if (n !== 3) throw new Error('expected 3 quests, got ' + n);
  await page.locator('.pf-card').screenshot({ path: 'shots/rw-profile.png' });
  const claim = page.locator('.pf-quest .btn-primary').first();
  if (await claim.count()) {
    const before = (await eco()).orbs;
    await claim.click();
    if ((await eco()).orbs <= before) throw new Error('quest claim gave no orbs');
  }
});

await step('shop: buy + equip a skin, theme applies', async () => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('utopia.economy'));
    raw.state.orbs = 1000;
    localStorage.setItem('utopia.economy', JSON.stringify(raw));
  });
  await page.goto(`${base}/shop`);
  await page.waitForSelector('.shop-grid');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/rw-shop.png', fullPage: true });
  await page.getByRole('button', { name: /Buy Ember/ }).click();
  await page.getByRole('button', { name: /Buy Ocean/ }).click();
  const e = await eco();
  if (e.equipped.skin !== 'skin-ember' || e.equipped.theme !== 'theme-ocean') throw new Error('not equipped ' + JSON.stringify(e.equipped));
  const vars = await page.evaluate(() => ({ accent: document.documentElement.style.getPropertyValue('--accent'), skin: document.documentElement.style.getPropertyValue('--skin') }));
  if (vars.accent !== '#6fe3ff' || !vars.skin.includes('#ff9c5b')) throw new Error('theme vars ' + JSON.stringify(vars));
  await page.screenshot({ path: 'shots/rw-shop-themed.png' });
});

await step('ad cap: 12/day', async () => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('utopia.economy'));
    raw.state.ads = { day: new Date().toISOString().slice(0, 10), count: 12 };
    localStorage.setItem('utopia.economy', JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForSelector('.shop-grid');
  if (await page.locator('.shop-sample').count()) throw new Error('ad sample offered past the cap');
});

await step('settings rewards group + about copy', async () => {
  await page.goto(`${base}/settings`);
  await page.getByText('Offer boosts before a game').waitFor();
  await page.goto(`${base}/about`);
  await page.getByText('forced ads').first().waitFor();
});

console.log(errors.length ? `\n${errors.length} problem(s):\n` + errors.join('\n') : '\nAll rewards checks passed.');
await browser.close();
process.exit(errors.length ? 1 : 0);
