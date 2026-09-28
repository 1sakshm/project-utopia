// Voice for games: Sarvam AI speech via the /api proxy, with graceful fallbacks.
//   TTS:  /api/tts (bulbul:v3, CDN-cached)  →  device speech (Web Speech)  →  none (captions only)
//   STT:  mic → 16 kHz WAV → /api/stt (saaras:v3)  →  browser SpeechRecognition  →  null (game switches to typing)
import type { SpeakOptions, VoiceApi, VoiceLang } from '@/sdk/types';
import { audioEngine } from './audio';
import { useSettings } from '@/platform/settings';

const SPEAKER: Record<VoiceLang, { female: string; male: string }> = {
  'en-IN': { female: 'priya', male: 'shubh' },
  'hi-IN': { female: 'kavya', male: 'aditya' },
};

// ---------- service probe (once per app session) ----------
let probe: Promise<boolean> | null = null;
export function sarvamAvailable(): Promise<boolean> {
  if (!probe) {
    probe = fetch('/api/tts?probe=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d: { configured?: boolean }) => d.configured === true)
      .catch(() => false);
  }
  return probe;
}
let sarvamOk: boolean | null = null;
void sarvamAvailable().then((ok) => (sarvamOk = ok));

// ---------- decoded TTS cache (shared by all games) ----------
const cache = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();
const keyOf = (text: string, lang: VoiceLang, speaker: string, pace: number) => `${lang}|${speaker}|${pace.toFixed(2)}|${text}`;

async function fetchBuffer(text: string, lang: VoiceLang, speaker: string, pace: number): Promise<AudioBuffer | null> {
  const k = keyOf(text, lang, speaker, pace);
  const hit = cache.get(k);
  if (hit) {
    cache.delete(k);
    cache.set(k, hit); // LRU bump
    return hit;
  }
  const running = inflight.get(k);
  if (running) return running;
  const p = (async () => {
    const ctx = audioEngine.ensure();
    if (!ctx) return null;
    const qs = new URLSearchParams({ text, lang, speaker, pace: pace.toFixed(2) });
    const r = await fetch(`/api/tts?${qs}`);
    if (!r.ok) return null;
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    cache.set(k, buf);
    while (cache.size > 120) cache.delete(cache.keys().next().value as string);
    return buf;
  })()
    .catch(() => null)
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

// ---------- device speech fallback ----------
function deviceSpeak(text: string, lang: VoiceLang, pace: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || signal.aborted) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.95 * pace;
    u.volume = Math.min(1, useSettings.getState().voice * useSettings.getState().master * 1.25);
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang.replace('_', '-') === lang) ?? voices.find((x) => x.lang.startsWith(lang.slice(0, 2)));
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
    setTimeout(finish, 1500 + text.length * 110);
    window.speechSynthesis.speak(u);
  });
}

// ---------- WAV encoding ----------
function toWav16k(chunks: Float32Array[], inRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    input.set(c, o);
    o += c.length;
  }
  const outRate = 16000;
  const outLen = Math.floor((total * outRate) / inRate);
  const pcm = new Int16Array(outLen);
  const ratio = inRate / outRate;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(total - 1, i0 + 1);
    const v = input[i0] + (input[i1] - input[i0]) * (x - i0);
    pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const dv = new DataView(buf);
  const w = (off: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(off + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.byteLength, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true);
  dv.setUint32(28, outRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}

// ---------- microphone capture with simple voice-activity detection ----------
async function recordUtterance(maxMs: number, onLevel?: (l: number) => void, signal?: AbortSignal): Promise<Blob | '' | null> {
  const ctx = audioEngine.ensure();
  if (!ctx || !navigator.mediaDevices?.getUserMedia) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    return null; // permission denied / no mic
  }
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  src.connect(proc);
  proc.connect(sink);
  sink.connect(ctx.destination);
  const chunks: Float32Array[] = [];
  const t0 = performance.now();
  let speech = false;
  let lastLoud = t0;
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: 'audio' | 'silence') => {
      if (finished) return;
      finished = true;
      proc.disconnect();
      src.disconnect();
      sink.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      onLevel?.(0);
      resolve(result === 'audio' && speech ? toWav16k(chunks, ctx.sampleRate) : '');
    };
    signal?.addEventListener('abort', () => finish('silence'));
    proc.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      onLevel?.(Math.min(1, rms * 8));
      const now = performance.now();
      if (rms > 0.03) {
        speech = true;
        lastLoud = now;
      }
      if (speech && now - lastLoud > 1100) finish('audio'); // stopped talking
      else if (!speech && now - t0 > 5000) finish('silence'); // never started
      else if (now - t0 > maxMs) finish('audio');
    };
  });
}

type SR = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };
function browserRecognize(lang: VoiceLang, maxMs: number): Promise<string | null> {
  const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return Promise.resolve(null);
  return new Promise((resolve) => {
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    let text: string | null = '';
    r.onresult = (e) => (text = Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onerror = () => (text = null);
    r.onend = () => resolve(text);
    setTimeout(() => r.stop(), maxMs);
    try {
      r.start();
    } catch {
      resolve(null);
    }
  });
}

// ---------- per-game facade ----------
export function createVoice(opts: {
  preview: boolean;
  signal: AbortSignal;
  muted: () => boolean;
  askConsent?: () => Promise<'mic' | 'typing'>;
}): VoiceApi {
  const playing = new Set<AudioBufferSourceNode>();
  const aborter = new AbortController();
  opts.signal.addEventListener('abort', () => api.stop());
  let langOverride: VoiceLang | null = null;
  const settings = () => useSettings.getState();
  const speakerFor = (lang: VoiceLang, o?: SpeakOptions) => SPEAKER[lang][o?.voice ?? settings().voiceGender];

  const api: VoiceApi = {
    source() {
      if (sarvamOk) return 'sarvam';
      return 'speechSynthesis' in window ? 'device' : 'none';
    },
    lang: () => langOverride ?? settings().voiceLang,
    setLang(l) {
      langOverride = l;
      if (!opts.preview) settings().set({ voiceLang: l });
    },
    async speak(text, o) {
      if (opts.preview || opts.muted() || !text.trim()) return;
      const lang = o?.lang ?? api.lang();
      const pace = o?.pace ?? 1;
      if (await sarvamAvailable()) {
        const buf = await fetchBuffer(text, lang, speakerFor(lang, o), pace);
        const ctx = audioEngine.ctx;
        if (buf && ctx && !opts.signal.aborted) {
          await new Promise<void>((resolve) => {
            const s = ctx.createBufferSource();
            s.buffer = buf;
            let node: AudioNode = s;
            if (o?.pan && ctx.createStereoPanner) {
              const p = ctx.createStereoPanner();
              p.pan.value = Math.max(-1, Math.min(1, o.pan));
              s.connect(p);
              node = p;
            }
            node.connect(audioEngine.voiceBus);
            playing.add(s);
            s.onended = () => {
              playing.delete(s);
              resolve();
            };
            s.start();
          });
          return;
        }
      }
      await deviceSpeak(text, lang, pace, aborter.signal);
    },
    prefetch(texts, o) {
      if (opts.preview) return;
      void sarvamAvailable().then((ok) => {
        if (!ok) return;
        const lang = o?.lang ?? api.lang();
        for (const t of texts.slice(0, 24)) void fetchBuffer(t, lang, speakerFor(lang, o), o?.pace ?? 1);
      });
    },
    stop() {
      for (const s of playing) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      playing.clear();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    async inputMode() {
      if (opts.preview) return 'typing';
      const pref = settings().voiceInput;
      if (pref === 'typing') return 'typing';
      if (!navigator.mediaDevices?.getUserMedia) return 'typing';
      if (pref === 'mic') return 'mic';
      const choice = opts.askConsent ? await opts.askConsent() : 'typing';
      settings().set({ voiceInput: choice });
      return choice;
    },
    async listen(o) {
      if (opts.preview) return null;
      const lang = o?.lang ?? api.lang();
      const maxMs = o?.maxMs ?? 7000;
      if (await sarvamAvailable()) {
        const wav = await recordUtterance(maxMs, o?.onLevel, opts.signal);
        if (wav === null) return null;
        if (wav === '') return '';
        try {
          const r = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
          if (!r.ok) return null;
          const data = (await r.json()) as { transcript?: string };
          return (data.transcript ?? '').trim();
        } catch {
          return null;
        }
      }
      return browserRecognize(lang, maxMs);
    },
  };
  return api;
}
