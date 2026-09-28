// Verifies PostHog analytics: events sent when on, nothing when off, v1 settings migrate, app survives PostHog outage.
// Usage: VITE_POSTHOG_KEY=phc_test npx vite build --outDir /tmp/utopia-ph && npx vite preview --outDir /tmp/utopia-ph --port 4180
//        then: node scripts/analytics-check.mjs   (all PostHog requests are intercepted; nothing is really sent)
import { chromium } from 'playwright';
import { gunzipSync } from 'node:zlib';
const base = 'http://localhost:4180';
const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });

async function run(label, setup) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  const events = [];
  const errors = [];
  await ctx.route(/posthog\.com/, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'POST') {
      let body = req.postDataBuffer() ?? Buffer.alloc(0);
      try {
        body = gunzipSync(body);
      } catch {}
      const txt = body.toString();
      let decoded = txt;
      const d = txt.match(/data=([^&]+)/);
      if (d) try { decoded = Buffer.from(decodeURIComponent(d[1]), 'base64').toString(); } catch {}
      const m = decoded.match(/"event":"([^"]+)"/g) ?? [];
      m.forEach((x) => events.push(x.slice(9, -1)));
    }
    // Pretend PostHog is fine (or unreachable for the offline test).
    if (label.includes('offline')) return route.abort();
    if (url.includes('config.js')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window._POSTHOG_REMOTE_CONFIG = window._POSTHOG_REMOTE_CONFIG || {};' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: url.includes('/flags') ? JSON.stringify({ featureFlags: {} }) : '{}' });
  });
  // Test-only: look like a normal browser (PostHog deliberately drops events from detected bots/automation).
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); try { Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/');
  await setup?.(p);
  await p.goto(base + '/');
  await p.waitForSelector('.card');
  await p.waitForTimeout(2500);
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(2200);
  await p.goto(base + '/library');
  await p.waitForTimeout(6000);
  const distinct = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ph_')).length);
  const cookies = (await ctx.cookies()).filter((c) => c.name.includes('ph_')).length;
  const uniq = [...new Set(events)];
  console.log(`${label}: ${events.length} events ${JSON.stringify(uniq)} | ph localStorage keys: ${distinct} | ph cookies: ${cookies} | page errors: ${errors.length}`);
  await ctx.close();
  return uniq;
}

const on = await run('default (on)');
const off = await run('turned off in settings', (p) =>
  p.evaluate(() => localStorage.setItem('utopia.settings', JSON.stringify({ state: { analytics: false }, version: 2 }))),
);
const migrated = await run('old v1 save with analytics:false (migrates to on)', (p) =>
  p.evaluate(() => localStorage.setItem('utopia.settings', JSON.stringify({ state: { analytics: false }, version: 1 }))),
);
await run('posthog unreachable (offline)');
const ok = on.includes('app_open') && on.includes('$pageview') && off.length === 0 && migrated.includes('app_open');
console.log(ok ? 'OK' : 'FAILED');
await b.close();
process.exit(ok ? 0 : 1);
