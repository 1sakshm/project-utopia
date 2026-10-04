// Shared Sarvam AI proxy handlers (Web-standard Request/Response).
// Used by the Vercel Edge functions (api/tts.ts, api/stt.ts) and by the Vite dev-server middleware.
// Files starting with "_" in /api are not deployed as their own functions.
//
// The Sarvam key is read server-side only (SARVAM_API_KEY). It never reaches the browser.

const SARVAM = 'https://api.sarvam.ai';

export const LANGS = ['en-IN', 'hi-IN'] as const;
export type Lang = (typeof LANGS)[number];

/** Two pleasant bulbul:v3 voices per language (female default, male for two-voice games). */
export const SPEAKERS: Record<string, true> = { priya: true, kavya: true, shubh: true, aditya: true };

const MAX_TTS_CHARS = 200;
const MAX_STT_BYTES = 600 * 1024; // ~18s of 16 kHz mono 16-bit WAV

/**
 * Best-effort per-IP rate limit (sliding 60s window). Each edge isolate keeps its own counts, so this stops simple
 * loops from one machine but is not a global guarantee: also add a Cloudflare rate-limiting rule for /api/* and a
 * spending cap in the Sarvam dashboard (see docs/PRD_HARDENING.md H1).
 */
const hits = new Map<string, number[]>();
const LIMITS = { tts: 40, stt: 20 } as const; // requests per IP per minute that reach Sarvam
export function rateLimited(req: Request, kind: keyof typeof LIMITS, now = Date.now()): boolean {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const k = `${kind}:${ip}`;
  const recent = (hits.get(k) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMITS[kind]) {
    hits.set(k, recent);
    return true;
  }
  recent.push(now);
  hits.set(k, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return false;
}

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
}

/**
 * Light abuse guard: only accept requests from our own pages (Origin/Referer host must match the request host,
 * or be localhost in dev). Not bulletproof; set a spending cap in the Sarvam dashboard too.
 */
function sameOrigin(req: Request): boolean {
  const host = new URL(req.url).host;
  const src = req.headers.get('origin') ?? req.headers.get('referer');
  if (!src) return false;
  try {
    const h = new URL(src).host;
    return h === host || h.startsWith('localhost') || h.startsWith('127.0.0.1');
  } catch {
    return false;
  }
}

/** GET /api/tts?text=&lang=&speaker=&pace=  → audio/wav (CDN-cacheable). `?probe=1` → { configured }. */
export async function handleTTS(req: Request, key: string | undefined): Promise<Response> {
  const url = new URL(req.url);
  // Always 200 (a 503 would show up as an error in every visitor's console); the body says whether voice is on.
  if (url.searchParams.get('probe') === '1') return json(200, { configured: !!key });
  if (!key) return json(503, { error: 'Voice service not configured' });
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  if (!sameOrigin(req)) return json(403, { error: 'Forbidden' });

  const text = (url.searchParams.get('text') ?? '').trim();
  const lang = url.searchParams.get('lang') ?? 'en-IN';
  const speaker = url.searchParams.get('speaker') ?? 'priya';
  const pace = Math.min(1.6, Math.max(0.6, Number(url.searchParams.get('pace') ?? 1) || 1));
  if (!text || text.length > MAX_TTS_CHARS) return json(400, { error: 'text must be 1-200 characters' });
  if (!(LANGS as readonly string[]).includes(lang)) return json(400, { error: 'unsupported lang' });
  if (!SPEAKERS[speaker]) return json(400, { error: 'unsupported speaker' });

  if (rateLimited(req, 'tts')) return json(429, { error: 'Too many requests' }, { 'retry-after': '60' });
  const r = await fetch(`${SARVAM}/text-to-speech`, {
    method: 'POST',
    headers: { 'api-subscription-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, language_code: lang, speaker, model: 'bulbul:v3', pace, speech_sample_rate: 24000 }),
  });
  if (!r.ok) return json(502, { error: 'TTS upstream error', status: r.status });
  const data = (await r.json()) as { audios?: string[] };
  const b64 = data.audios?.[0];
  if (!b64) return json(502, { error: 'TTS returned no audio' });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'audio/wav',
      // Same phrase → same audio: let browsers and Vercel's CDN cache it for everyone (keeps the Sarvam bill tiny).
      'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  });
}

/** POST /api/stt  (body: audio/wav)  → { transcript, language_code } */
export async function handleSTT(req: Request, key: string | undefined): Promise<Response> {
  if (!key) return json(503, { error: 'Voice service not configured' });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!sameOrigin(req)) return json(403, { error: 'Forbidden' });
  if (rateLimited(req, 'stt')) return json(429, { error: 'Too many requests' }, { 'retry-after': '60' });
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 1000) return json(400, { error: 'audio too short' });
  if (buf.byteLength > MAX_STT_BYTES) return json(413, { error: 'audio too long' });

  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/wav' }), 'speech.wav');
  form.append('model', 'saaras:v3');
  form.append('mode', 'transcribe');
  const r = await fetch(`${SARVAM}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': key }, body: form });
  if (!r.ok) return json(502, { error: 'STT upstream error', status: r.status });
  const data = (await r.json()) as { transcript?: string; language_code?: string };
  // Nothing is logged or stored: the audio only passes through to Sarvam.
  return json(200, { transcript: data.transcript ?? '', language_code: data.language_code ?? null });
}
