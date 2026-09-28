# Marketing assets

Everything here is generated from code, using the app's own fonts, colors, glyphs and real game footage.
All art and music are original and procedural, so there's nothing to license.

## Outputs (`marketing/out/`)

| File | Use |
|---|---|
| `utopia-logo-2160.png` | HD logo (2160×2160), e.g. LinkedIn company/profile logo |
| `utopia-logo-400.png` | LinkedIn's recommended upload size |
| `utopia-mark-transparent-1080.png` | The planet mark on a transparent background |
| `utopia-linkedin-banner-3168x792.png` | LinkedIn banner, 2× (HD) |
| `utopia-linkedin-banner-1584x396.png` | LinkedIn banner, exact size |
| `utopia-promo-9x16.mp4` | 30s promo, 1080×1920 (Reels / Shorts / vertical feeds) |
| `utopia-promo-4x5.mp4` | 30s promo, 1080×1350 (best in-feed format for LinkedIn and X) |

Post copy for LinkedIn and X is in [`POSTS.md`](./POSTS.md).

## Re-rendering

The dev server must be running (`npm run dev`).

```bash
node scripts/render-marketing.mjs          # logo + banner PNGs
node scripts/capture-clips.mjs             # real 30fps game footage (virtual clock) → out/clips/
node scripts/make-soundtrack.mjs           # original 80 BPM soundtrack → out/soundtrack.wav
node scripts/render-promo.mjs --w=1080 --h=1920 --name=utopia-promo-9x16
node scripts/render-promo.mjs --w=1080 --h=1350 --name=utopia-promo-4x5
node scripts/render-promo.mjs --stills=2.5,7,20 --w=1080 --h=1920   # quick preview frames → shots/
```

Open `http://localhost:5173/marketing/promo.html?play=1` to watch the promo live in a browser
(add `&w=1080&h=1350` for the 4:5 layout).

## Sources

- `brand.css`: shared brand tokens, the planet mark and the aurora
- `logo.html`, `banner.html`: artboards
- `promo.tsx`, `promo.css`: the video. Every frame is a pure function of time; the montage clip list and
  copy are at the top of `promo.tsx`.
