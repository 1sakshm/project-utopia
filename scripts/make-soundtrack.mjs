// Synthesize the 30s promo soundtrack (original, procedural — no licensing) → marketing/out/soundtrack.wav
// 80 BPM (beat = 0.75s) so montage cuts (every 1.5s from 6s) land on beats. D major, dreamy + light pulse.
import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 44100;
const DUR = 30;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);
const BEAT = 0.75;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(t0, dur, fn, pan = 0, gain = 1) {
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.floor((t0 + dur) * SR));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR;
    const v = fn(t, i / SR);
    L[i] += v * gl;
    R[i] += v * gr;
  }
}
const adsr = (t, dur, a, r) => Math.min(1, t / a) * Math.min(1, Math.max(0, (dur - t) / r));

// ---- Pads: one chord per bar (4 beats = 3s)
const CHORDS = [
  [50, 57, 62, 64, 66], // D add9
  [47, 54, 59, 62, 66], // Bm7
  [43, 50, 55, 59, 62], // Gmaj7
  [45, 52, 57, 61, 64], // A (add9-ish)
];
function pad(t0, dur, notes, gain) {
  notes.forEach((n, k) => {
    const f = midi(n + 12);
    add(
      t0,
      dur + 1.2,
      (t) => {
        const e = adsr(t, dur + 1.2, 1.1, 1.4);
        const lfo = 1 + 0.003 * Math.sin(2 * Math.PI * 0.2 * t + k);
        return e * (0.55 * Math.sin(2 * Math.PI * f * lfo * t) + 0.25 * Math.sin(2 * Math.PI * f * 1.003 * t) + 0.12 * Math.sin(2 * Math.PI * f * 2 * t));
      },
      (k / (notes.length - 1)) * 1.2 - 0.6,
      gain / notes.length,
    );
  });
}
for (let bar = 0; bar < 10; bar++) {
  const t0 = bar * 4 * BEAT;
  const ch = bar === 9 ? CHORDS[0] : CHORDS[bar % 4];
  pad(t0, 4 * BEAT, ch, bar < 2 ? 0.22 : 0.3);
}
// Final sustained chord at the logo
pad(24, 5.2, [38, 50, 57, 62, 66, 69], 0.34);

// ---- Bass (from the feed scene on)
for (let bar = 1; bar < 8; bar++) {
  const t0 = bar * 4 * BEAT;
  const root = CHORDS[bar % 4][0] - 12;
  for (const b of [0, 2.5]) {
    add(t0 + b * BEAT, 1.2, (t) => adsr(t, 1.2, 0.01, 0.6) * Math.sin(2 * Math.PI * midi(root) * t) * (1 + 0.3 * Math.sin(2 * Math.PI * midi(root) * 2 * t)), 0, 0.28);
  }
}

// ---- Kalimba-style plucks: eighth-note arpeggios during the montage (6–18s), sparser in the promises (18–24s)
function pluck(t0, n, gain, pan) {
  const f = midi(n);
  add(t0, 1.4, (t) => Math.exp(-t * 5.5) * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t * 12)), pan, gain);
}
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81];
for (let t = 6; t < 24; t += BEAT / 2) {
  const bar = Math.floor(t / (4 * BEAT));
  const step = Math.round((t - 6) / (BEAT / 2));
  if (t >= 18 && step % 2 === 1) continue;
  const chord = CHORDS[bar % 4];
  const pool = PENTA.filter((p) => chord.some((c) => (p - c) % 12 === 0) || step % 3 === 0);
  const n = pool[(step * 5 + bar) % pool.length];
  pluck(t, n, t < 18 ? 0.16 : 0.12, ((step % 4) - 1.5) / 2);
}

// ---- Soft kick + hats: the pulse of the montage
function kick(t0, gain) {
  add(t0, 0.35, (t) => {
    const f = 45 + 70 * Math.exp(-t * 28);
    return Math.exp(-t * 9) * Math.sin(2 * Math.PI * f * t);
  }, 0, gain);
}
function hat(t0, gain, pan) {
  let prev = 0;
  add(t0, 0.08, (t) => {
    const n = rnd();
    const hp = n - prev; // crude high-pass
    prev = n;
    return Math.exp(-t * 60) * hp;
  }, pan, gain);
}
for (let t = 6; t < 24; t += BEAT) {
  const beatIdx = Math.round((t - 6) / BEAT);
  if (t < 18 || beatIdx % 2 === 0) kick(t, t < 18 ? 0.5 : 0.32);
  hat(t + BEAT / 2, t < 18 ? 0.05 : 0.03, 0.3);
}

// ---- Whooshes into each scene change
function whoosh(tEnd, dur, gain) {
  let lp = 0;
  add(tEnd - dur, dur + 0.3, (t) => {
    const k = Math.min(1, t / dur);
    const cutoff = 0.02 + 0.25 * k * k; // one-pole coefficient rises → brighter
    lp += cutoff * (rnd() - lp);
    const e = Math.pow(k, 2) * Math.min(1, Math.max(0, (dur + 0.3 - t) / 0.3));
    return lp * e;
  }, 0, gain);
}
whoosh(3.0, 0.9, 0.9);
whoosh(6.0, 0.9, 1.0);
whoosh(18.0, 0.9, 0.9);
whoosh(24.0, 1.1, 1.0);

// ---- Chimes: logo reveals
function bell(t0, n, gain, pan = 0) {
  const f = midi(n);
  const parts = [
    [1, 1, 1],
    [2.76, 0.45, 0.6],
    [5.4, 0.2, 0.35],
  ];
  add(t0, 3, (t) => parts.reduce((s, [r, a, d]) => s + a * Math.exp(-t / (1.4 * d)) * Math.sin(2 * Math.PI * f * r * t), 0), pan, gain);
}
bell(0.3, 74, 0.1, -0.2);
bell(0.45, 81, 0.07, 0.2);
bell(1.5, 78, 0.05, 0);
bell(24.1, 74, 0.12, -0.2);
bell(24.25, 78, 0.09, 0.1);
bell(24.4, 81, 0.08, 0.25);
bell(26.0, 86, 0.05, 0);

// ---- Master: gentle fade in/out, soft clip, normalize to -1 dBFS
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.6) * Math.min(1, (DUR - t) / 1.6);
  L[i] = Math.tanh(L[i] * 1.1) * fade;
  R[i] = Math.tanh(R[i] * 1.1) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
mkdirSync('marketing/out', { recursive: true });
writeFileSync('marketing/out/soundtrack.wav', buf);
console.log('wrote marketing/out/soundtrack.wav', (buf.length / 1e6).toFixed(1) + 'MB', 'peak', peak.toFixed(2));
