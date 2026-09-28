// End-to-end voice flow in the real app (no Sarvam key needed):
//  1. mic game → how-to → consent sheet → "Type instead" → typed answers work → choice persisted
//  2. fresh profile → "Use microphone" with a fake mic → no key → graceful fallback to typing (no errors)
// Usage: node scripts/voice-e2e.mjs [--port=5173]
import { chromium } from 'playwright';

const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5173').split('=')[1];
const base = `http://localhost:${port}`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
let fails = 0;
const ok = (c, m) => {
  console.log(c ? '✓' : '✗', m);
  if (!c) fails++;
};

async function open(game, choice) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/DevTools|GPU|WebGL|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${base}/play/${game}`);
  const go = page.locator('.howto .btn-primary');
  await go.waitFor({ timeout: 20000 });
  await go.click();
  const sheet = page.locator('.voice-consent');
  await sheet.waitFor({ timeout: 25000 });
  ok(true, `${game}: consent sheet appears before the mic is used`);
  await sheet.getByRole('button', { name: choice === 'mic' ? 'Use microphone' : 'Type instead' }).click();
  return { ctx, page, errors };
}

// 1. Type instead
{
  const { ctx, page, errors } = await open('say-it-back', 'typing');
  const input = page.locator('input.u-answer-input');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  ok(true, 'say-it-back: typing field shown after "Type instead"');
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => document.querySelector('.u-answer')?.classList.contains('is-asking'), null, { timeout: 25000 });
    await input.fill('hello');
    await input.press('Enter');
    await page.waitForTimeout(1500);
  }
  const hud = await page.locator('.hud').textContent();
  ok(/\d/.test(hud ?? ''), `say-it-back: typed answers are scored (HUD: ${(hud ?? '').replace(/\s+/g, ' ').trim()})`);
  const pref = await page.evaluate(() => JSON.parse(localStorage.getItem('utopia.settings') ?? '{}').state?.voiceInput);
  ok(pref === 'typing', `choice persisted (voiceInput = ${pref})`);
  ok(errors.length === 0, `no page errors (${errors.join(' | ').slice(0, 200)})`);
  await ctx.close();
}

// 2. Use microphone without a Sarvam key → graceful fallback
{
  const { ctx, page, errors } = await open('digit-echo', 'mic');
  const mic = page.locator('.u-mic');
  await mic.waitFor({ state: 'visible', timeout: 20000 });
  ok(true, 'digit-echo: mic button shown after "Use microphone"');
  await page.waitForFunction(() => document.querySelector('.u-answer')?.classList.contains('is-asking'), null, { timeout: 30000 });
  await mic.click();
  // With no key the SDK tries browser recognition, then falls back to typing.
  const fellBack = await page
    .locator('input.u-answer-input')
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  const hint = await page.locator('.u-answer-hint').textContent();
  ok(fellBack || /try again|type/i.test(hint ?? ''), `digit-echo: mic path degrades gracefully (hint: "${hint?.trim()}")`);
  ok(errors.length === 0, `no page errors (${errors.join(' | ').slice(0, 200)})`);
  await ctx.close();
}

await browser.close();
console.log(fails ? `FAILED ${fails}` : 'OK');
process.exit(fails ? 1 : 0);
