// Canvas-generated textures for Night Harbor.
import { Texture } from 'pixi.js';

/** Lighthouse beam: a soft cone whose apex sits at the left-center of the texture. */
export function beamTexture(): Texture {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.filter = 'blur(10px)';
  const grd = g.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(8, h / 2 - 4);
  g.lineTo(w - 10, 18);
  g.lineTo(w - 10, h - 18);
  g.lineTo(8, h / 2 + 4);
  g.closePath();
  g.fill();
  return Texture.from(c);
}

/** Fog bank: opaque at the left edge fading to the right, soft at top and bottom, lumpy. */
export function fogTexture(): Texture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.filter = 'blur(8px)';
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = Math.pow(r(), 1.6) * w * 0.9;
    const y = h * (0.3 + r() * 0.4);
    const rad = 18 + r() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.5 * (1 - x / w);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  const lin = g.createLinearGradient(0, 0, w, 0);
  lin.addColorStop(0, 'rgba(255,255,255,0.75)');
  lin.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  lin.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lin;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.35, 'rgba(0,0,0,1)');
  v.addColorStop(0.7, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return Texture.from(c);
}

/** Broken, shimmering vertical streak used for lamp reflections on the water. */
export function streakTexture(): Texture {
  const w = 24;
  const h = 72;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y += 3) {
    const fall = Math.pow(1 - y / h, 1.6);
    const half = (w / 2) * (0.35 + 0.65 * Math.abs(Math.sin(y * 0.37)));
    const grd = g.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, `rgba(255,255,255,${0.9 * fall})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(w / 2 - half, y, half * 2, 2);
  }
  return Texture.from(c);
}
