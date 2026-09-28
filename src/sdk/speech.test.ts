import { describe, expect, it, vi, afterEach } from 'vitest';
import { bestMatch, heardWord, normalizeText, parseDigits, similarity } from './speech';
import { handleSTT, handleTTS } from '../../api/_sarvam';

describe('speech helpers', () => {
  it('normalizes English and Devanagari text', () => {
    expect(normalizeText('  Hello, World!! ')).toBe('hello world');
    expect(normalizeText('नमस्ते, दुनिया।')).toBe('नमस्ते दुनिया');
    expect(normalizeText('३५')).toBe('35');
  });
  it('parses spoken digits in many forms', () => {
    expect(parseDigits('3 5 7')).toEqual([3, 5, 7]);
    expect(parseDigits('357')).toEqual([3, 5, 7]);
    expect(parseDigits('three five seven')).toEqual([3, 5, 7]);
    expect(parseDigits('तीन पाँच सात')).toEqual([3, 5, 7]);
    expect(parseDigits('uh, four... two')).toEqual([4, 2]);
  });
  it('compares fairly', () => {
    expect(similarity('Butterfly', 'butterfly!')).toBe(1);
    expect(similarity('cat', 'dog')).toBeLessThan(0.5);
    expect(heardWord('I think it was a tiger', 'tiger')).toBe(true);
    expect(heardWord('elefant', 'elephant')).toBe(true);
    expect(bestMatch('it is an apple', ['banana', 'apple', 'grape'])).toBe(1);
    expect(bestMatch('zzz', ['banana', 'apple'])).toBe(-1);
  });
});

describe('sarvam proxy', () => {
  afterEach(() => vi.restoreAllMocks());
  const get = (qs: string, origin = 'https://utopia.test') => new Request(`https://utopia.test/api/tts?${qs}`, { headers: { origin } });

  it('probe reports configuration without calling Sarvam', async () => {
    expect(await (await handleTTS(get('probe=1'), 'k')).json()).toEqual({ configured: true });
    expect(await (await handleTTS(get('probe=1'), undefined)).json()).toEqual({ configured: false });
  });
  it('rejects foreign origins and bad params', async () => {
    expect((await handleTTS(get('text=hi', 'https://evil.example'), 'k')).status).toBe(403);
    expect((await handleTTS(get('text=' + 'a'.repeat(300)), 'k')).status).toBe(400);
    expect((await handleTTS(get('text=hi&lang=fr-FR'), 'k')).status).toBe(400);
    expect((await handleTTS(get('text=hi&speaker=nobody'), 'k')).status).toBe(400);
  });
  it('returns cacheable WAV from Sarvam TTS', async () => {
    const wav = btoa('RIFF....WAVEfmt ');
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ audios: [wav] }), { status: 200 }));
    const r = await handleTTS(get('text=hello&lang=en-IN&speaker=priya'), 'secret');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('audio/wav');
    expect(r.headers.get('cache-control')).toContain('s-maxage');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sarvam.ai/text-to-speech');
    expect((init.headers as Record<string, string>)['api-subscription-key']).toBe('secret');
    expect(JSON.parse(init.body as string)).toMatchObject({ text: 'hello', language_code: 'en-IN', speaker: 'priya', model: 'bulbul:v3' });
  });
  it('forwards audio to Sarvam STT and returns the transcript', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ transcript: 'hello there', language_code: 'en-IN' }), { status: 200 }));
    const req = new Request('https://utopia.test/api/stt', { method: 'POST', headers: { origin: 'https://utopia.test', 'content-type': 'audio/wav' }, body: new Uint8Array(4000) });
    const r = await handleSTT(req, 'secret');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ transcript: 'hello there', language_code: 'en-IN' });
  });
  it('never calls Sarvam without a key', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    expect((await handleTTS(get('text=hi'), undefined)).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
});
