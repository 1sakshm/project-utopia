// Render the promo video frame-by-frame and encode to MP4 (H.264 + AAC).
// Usage:
//   node scripts/render-promo.mjs --w=1080 --h=1920 --name=utopia-promo-9x16
//   node scripts/render-promo.mjs --w=1080 --h=1350 --name=utopia-promo-4x5
//   node scripts/render-promo.mjs --stills=1.8,4.6,7 --w=1080 --h=1920   (preview PNGs only)
// Needs: dev server on :5173, captured clips (scripts/capture-clips.mjs), soundtrack (scripts/make-soundtrack.mjs).
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const W = Number(arg('w', 1080));
const H = Number(arg('h', 1920));
const name = arg('name', `utopia-promo-${W}x${H}`);
const stills = arg('stills', '');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 200)));
await page.goto(`http://localhost:5173/marketing/promo.html?w=${W}&h=${H}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__promo, null, { timeout: 30000 });
await page.evaluate(() => window.__promo.ready);
const { fps, duration } = await page.evaluate(() => ({ fps: window.__promo.fps, duration: window.__promo.duration }));

if (stills) {
  mkdirSync('shots', { recursive: true });
  for (const s of stills.split(',').map(Number)) {
    await page.evaluate((t) => window.__promo.render(t), s);
    await page.screenshot({ path: `shots/promo-${W}x${H}-${s}.png` });
    console.log('still', s);
  }
  await browser.close();
  process.exit(0);
}

const dir = `marketing/out/frames-${name}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const total = Math.round(fps * duration);
const t0 = Date.now();
for (let f = 0; f < total; f++) {
  await page.evaluate((t) => window.__promo.render(t), f / fps);
  await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 93 });
  if (f % 60 === 0) console.log(`frame ${f}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await browser.close();

const audio = 'marketing/out/soundtrack.wav';
const out = `marketing/out/${name}.mp4`;
const aArgs = existsSync(audio) ? ['-i', audio] : [];
execFileSync(
  ffmpeg,
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-framerate',
    String(fps),
    '-i',
    `${dir}/%04d.jpg`,
    ...aArgs,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '17',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-movflags',
    '+faststart',
    ...(aArgs.length ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    out,
  ],
  { stdio: 'inherit' },
);
rmSync(dir, { recursive: true, force: true });
console.log('wrote', out);
