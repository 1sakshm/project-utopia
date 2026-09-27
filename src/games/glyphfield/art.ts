// Procedural textures for Glyphfield (canvas-generated, no network assets).
import { Texture } from 'pixi.js';

let causticCache: Texture | null = null;

/** Tileable caustic web: bright where the two nearest Voronoi cells meet (wrap-around distance). */
export function causticTexture(size = 256, cells = 14, seed = 7): Texture {
  if (causticCache && !causticCache.destroyed) return causticCache;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < cells; i++) pts.push([r() * size, r() * size]);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      for (const [px, py] of pts) {
        let dx = Math.abs(px - x);
        let dy = Math.abs(py - y);
        if (dx > half) dx = size - dx;
        if (dy > half) dy = size - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const v = Math.pow(Math.max(0, 1 - edge / 16), 2.4);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  // soften (tiled 3×3 so the blur wraps seamlessly)
  const c2 = document.createElement('canvas');
  c2.width = c2.height = size;
  const g2 = c2.getContext('2d')!;
  g2.filter = 'blur(2.5px)';
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) g2.drawImage(c, ox * size, oy * size);
  causticCache = Texture.from(c2);
  causticCache.source.style.addressMode = 'repeat';
  return causticCache;
}

/** Soft vertical light shaft (white, fades to the bottom and to both sides). */
export function rayTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,1)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 256);
  return Texture.from(c);
}

/** Radial vignette (transparent center, dark edges). */
export function vignetteTexture(color = '0,4,10'): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 40, 128, 128, 180);
  grd.addColorStop(0, `rgba(${color},0)`);
  grd.addColorStop(1, `rgba(${color},0.75)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return Texture.from(c);
}
