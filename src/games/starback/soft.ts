// Soft (dark neumorphism / "clay") helpers for this game's R3F scene. Used only when ctx.settings.soft.
import * as THREE from 'three';

/** Mix a hex color toward white (amt > 0) or black (amt < 0), in sRGB space. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const t = amt >= 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(amt));
  const ch = (v: number) => Math.round(v + (t - v) * a).toString(16).padStart(2, '0');
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

/** Matte clay material. */
export function clay(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
}

/** A rounded "puck" (cylinder with soft bevelled top and bottom edges) as a lathe; base sits at y=0. */
export function puckGeometry(radius: number, height: number, bevel: number, segments = 40): THREE.LatheGeometry {
  const b = Math.min(bevel, height / 2, radius);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let k = 0; k <= 6; k++) {
      const a = a0 + ((a1 - a0) * k) / 6;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b));
    }
  };
  arc(radius - b, b, -Math.PI / 2, 0);
  arc(radius - b, height - b, 0, Math.PI / 2);
  pts.push(new THREE.Vector2(0, height));
  return new THREE.LatheGeometry(pts, segments);
}
