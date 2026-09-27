import type { GameAudio, ToneOptions } from '@/sdk/types';

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  voice: number;
  mono: boolean;
}

const SCALES: Record<string, number[]> = {
  majorPenta: [0, 2, 4, 7, 9],
  minorPenta: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export const midiToFreq = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Global Web Audio engine: one context, master/music/sfx/voice buses. */
class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  voice = 0.9;
  private noiseBuf: AudioBuffer | null = null;
  private volumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8, voice: 0.9, mono: false };
  calibrationMs = 0;

  ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.ctx = ctx;
    this.apply(this.volumes);
    return ctx;
  }

  /** Must be called from a user gesture (Play tap, sound toggle). */
  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  }

  apply(v: Volumes) {
    this.volumes = v;
    this.voice = v.voice;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.03);
    this.music.gain.setTargetAtTime(v.music, t, 0.03);
    this.sfx.gain.setTargetAtTime(v.sfx, t, 0.03);
    this.master.channelCount = v.mono ? 1 : 2;
    this.master.channelCountMode = 'explicit';
    this.master.channelInterpretation = 'speakers';
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
  }
  resume() {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    if ('speechSynthesis' in window) window.speechSynthesis.resume();
  }

  noiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 2;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }

  // ---- Platform UI sounds (D major pentatonic) ----
  private ui?: GameAudio;
  private uiAudio() {
    if (!this.ui) this.ui = createGameAudio({ muted: () => false, signal: new AbortController().signal });
    return this.ui;
  }
  uiTap() {
    if (!this.ctx) return;
    this.uiAudio().tone(midiToFreq(86), { dur: 0.05, type: 'sine', gain: 0.12, attack: 0.002, release: 0.05 });
  }
  uiPlay() {
    if (!this.ctx) return;
    const a = this.uiAudio();
    a.noise({ dur: 0.35, filter: 600, sweepTo: 3200, gain: 0.08, q: 0.7 });
    a.chime(midiToFreq(74), { gain: 0.1 });
    a.chime(midiToFreq(81), { gain: 0.08, when: a.now() + 0.06 });
  }
  uiExit() {
    if (!this.ctx) return;
    const a = this.uiAudio();
    a.noise({ dur: 0.25, filter: 2600, sweepTo: 500, gain: 0.06, q: 0.7 });
  }
}

export const audioEngine = new AudioEngine();

/** Creates a per-game audio facade with its own sub-buses (cleaned up on abort). */
export function createGameAudio(opts: { muted: () => boolean; signal: AbortSignal }): GameAudio & { setMuted(m: boolean): void } {
  const eng = audioEngine;
  let sfxOut: GainNode | null = null;
  let musicOut: GainNode | null = null;
  const stops = new Set<() => void>();

  const ensure = () => {
    const ctx = eng.ctx;
    if (!ctx) return null;
    if (!sfxOut) {
      sfxOut = ctx.createGain();
      musicOut = ctx.createGain();
      sfxOut.connect(eng.sfx);
      musicOut.connect(eng.music);
      const g = opts.muted() ? 0 : 1;
      sfxOut.gain.value = g;
      musicOut.gain.value = g;
    }
    return ctx;
  };

  opts.signal.addEventListener('abort', () => {
    stops.forEach((s) => s());
    stops.clear();
    const ctx = eng.ctx;
    const s = sfxOut;
    const m = musicOut;
    if (ctx && s && m) {
      const t = ctx.currentTime;
      s.gain.setTargetAtTime(0, t, 0.05);
      m.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => {
        s.disconnect();
        m.disconnect();
      }, 400);
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  });

  const out = (bus?: 'sfx' | 'music') => (bus === 'music' ? musicOut : sfxOut)!;

  const env = (ctx: AudioContext, o: ToneOptions, peak: number, defDur: number) => {
    const when = o.when ?? ctx.currentTime;
    const dur = o.dur ?? defDur;
    const attack = o.attack ?? 0.005;
    const release = o.release ?? dur;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + release);
    let node: AudioNode = g;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      node = p;
    }
    node.connect(out(o.bus));
    return { g, when, end: when + attack + release + 0.05 };
  };

  const osc = (ctx: AudioContext, type: OscillatorType, freq: number, dest: AudioNode, when: number, end: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start(when);
    o.stop(end);
    return o;
  };

  const api: GameAudio & { setMuted(m: boolean): void } = {
    get raw() {
      return eng.ctx;
    },
    get sfxOut() {
      ensure();
      return sfxOut;
    },
    get musicOut() {
      ensure();
      return musicOut;
    },
    now: () => eng.ctx?.currentTime ?? performance.now() / 1000,
    latency: () => {
      const c = eng.ctx as (AudioContext & { outputLatency?: number }) | null;
      const base = c ? (c.outputLatency || c.baseLatency || 0) : 0;
      return base + eng.calibrationMs / 1000;
    },
    midi: midiToFreq,
    scale(root, mode = 'majorPenta') {
      const steps = SCALES[mode];
      return (deg: number) => {
        const n = steps.length;
        const oct = Math.floor(deg / n);
        const idx = ((deg % n) + n) % n;
        return midiToFreq(root + oct * 12 + steps[idx]);
      };
    },
    tone(freq, o = {}) {
      const ctx = ensure();
      if (!ctx) return;
      const e = env(ctx, o, o.gain ?? 0.2, 0.25);
      osc(ctx, o.type ?? 'sine', freq, e.g, e.when, e.end, o.detune);
    },
    pluck(freq, o = {}) {
      const ctx = ensure();
      if (!ctx) return;
      const e = env(ctx, { attack: 0.003, ...o }, o.gain ?? 0.22, 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(freq * 8, e.when);
      lp.frequency.exponentialRampToValueAtTime(freq * 1.5, e.when + 0.3);
      lp.connect(e.g);
      osc(ctx, 'triangle', freq, lp, e.when, e.end);
      osc(ctx, 'sine', freq * 2, lp, e.when, e.end, 3);
    },
    bell(freq, o = {}) {
      const ctx = ensure();
      if (!ctx) return;
      const partials: Array<[number, number, number]> = [
        [1, 1, 1],
        [2.76, 0.45, 0.6],
        [5.4, 0.2, 0.35],
        [8.93, 0.08, 0.2],
      ];
      const baseDur = o.dur ?? 1.6;
      for (const [ratio, amp, durK] of partials) {
        const e = env(ctx, { ...o, attack: 0.002, release: baseDur * durK }, (o.gain ?? 0.16) * amp, baseDur);
        osc(ctx, 'sine', freq * ratio, e.g, e.when, e.end);
      }
    },
    chime(freq, o = {}) {
      const ctx = ensure();
      if (!ctx) return;
      const e = env(ctx, { attack: 0.004, release: o.dur ?? 1.1, ...o }, o.gain ?? 0.14, 1.1);
      osc(ctx, 'sine', freq, e.g, e.when, e.end);
      osc(ctx, 'sine', freq * 2, e.g, e.when, e.end, 4);
      osc(ctx, 'triangle', freq * 3, e.g, e.when, e.when + 0.15);
    },
    thunk(o = {}) {
      const ctx = ensure();
      if (!ctx) return;
      const e = env(ctx, { attack: 0.004, release: 0.22, ...o }, o.gain ?? 0.28, 0.22);
      const oo = osc(ctx, 'sine', 150, e.g, e.when, e.end);
      oo.frequency.exponentialRampToValueAtTime(62, e.when + 0.18);
      api.noise({ dur: 0.08, filter: 400, gain: (o.gain ?? 0.28) * 0.3, when: o.when, pan: o.pan });
    },
    noise(o = {}) {
      const ctx = ensure();
      const buf = eng.noiseBuffer();
      if (!ctx || !buf) return;
      const e = env(ctx, { attack: (o.dur ?? 0.3) * 0.3, release: (o.dur ?? 0.3) * 0.7, ...o }, o.gain ?? 0.12, 0.3);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = o.q ?? 1;
      f.frequency.setValueAtTime(o.filter ?? 1200, e.when);
      if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, e.end);
      f.connect(e.g);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(f);
      src.start(e.when, Math.random());
      src.stop(e.end);
    },
    tick() {
      api.tone(midiToFreq(93), { dur: 0.04, gain: 0.07, attack: 0.001, release: 0.04 });
    },
    success() {
      const t = api.now();
      api.chime(midiToFreq(79), { gain: 0.12, when: t });
      api.chime(midiToFreq(83), { gain: 0.1, when: t + 0.07 });
      api.chime(midiToFreq(86), { gain: 0.1, when: t + 0.14 });
    },
    error() {
      const t = api.now();
      api.tone(midiToFreq(55), { dur: 0.18, type: 'triangle', gain: 0.12, when: t });
      api.tone(midiToFreq(52), { dur: 0.26, type: 'triangle', gain: 0.1, when: t + 0.12 });
    },
    ambient(chord, o = {}) {
      const ctx = ensure();
      if (!ctx) return () => {};
      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.gain.setTargetAtTime(o.gain ?? 0.07, ctx.currentTime, 1.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500 + (o.brightness ?? 0.4) * 1400;
      lp.Q.value = 0.5;
      lp.connect(master);
      master.connect(musicOut!);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 250;
      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);
      lfo.start();
      const nodes: OscillatorNode[] = [lfo];
      chord.forEach((n, i) => {
        for (const det of [-6, 6]) {
          const oo = ctx.createOscillator();
          oo.type = i === 0 ? 'sine' : 'triangle';
          oo.frequency.value = midiToFreq(n);
          oo.detune.value = det;
          const g = ctx.createGain();
          g.gain.value = 0.5 / chord.length;
          // slow swell per voice
          const sw = ctx.createOscillator();
          const swg = ctx.createGain();
          sw.frequency.value = 0.05 + i * 0.023;
          swg.gain.value = 0.25 / chord.length;
          sw.connect(swg);
          swg.connect(g.gain);
          sw.start();
          oo.connect(g);
          g.connect(lp);
          oo.start();
          nodes.push(oo, sw);
        }
      });
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(0.0001, t, 0.3);
        setTimeout(() => {
          nodes.forEach((n) => {
            try {
              n.stop();
            } catch {
              /* already stopped */
            }
          });
          master.disconnect();
        }, 1500);
        stops.delete(stop);
      };
      stops.add(stop);
      return stop;
    },
    speak(text, o = {}) {
      return new Promise<void>((resolve) => {
        if (opts.muted() || !('speechSynthesis' in window) || opts.signal.aborted) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = o.rate ?? 0.9;
        u.pitch = o.pitch ?? 1;
        u.volume = Math.min(1, eng.voice * (eng.ctx ? eng.master.gain.value / 0.8 : 1));
        const voices = window.speechSynthesis.getVoices();
        const v =
          voices.find((x) => /en[-_]US/i.test(x.lang) && /natural|samantha|aria|jenny|google us/i.test(x.name)) ??
          voices.find((x) => /^en/i.test(x.lang));
        if (v) u.voice = v;
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        u.onend = finish;
        u.onerror = finish;
        setTimeout(finish, 1500 + text.length * 120);
        window.speechSynthesis.speak(u);
      });
    },
    setMuted(m: boolean) {
      const ctx = eng.ctx;
      if (!ctx || !sfxOut || !musicOut) return;
      const t = ctx.currentTime;
      sfxOut.gain.setTargetAtTime(m ? 0 : 1, t, 0.1);
      musicOut.gain.setTargetAtTime(m ? 0 : 1, t, 0.1);
    },
  };
  return api;
}
