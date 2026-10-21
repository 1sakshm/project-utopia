import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkPassword, hashPassword, verifyGoogleToken, verifyPassword } from './auth';
import type { Env } from './util';

const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
let priv: CryptoKey;
let jwk: JsonWebKey;
let otherPriv: CryptoKey;

async function sign(claims: Record<string, unknown>, key = priv, kid = 'k1') {
  const h = enc({ alg: 'RS256', kid, typ: 'JWT' });
  const p = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}

const env = { GOOGLE_CLIENT_ID: 'my-client.apps.googleusercontent.com' } as Env;
const good = () => ({
  iss: 'https://accounts.google.com',
  aud: env.GOOGLE_CLIENT_ID,
  sub: '1234567890',
  email: 'player@gmail.com',
  email_verified: true,
  exp: Math.floor(Date.now() / 1000) + 600,
});

beforeAll(async () => {
  const params = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const kp = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  priv = kp.privateKey;
  jwk = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as JsonWebKey;
  otherPriv = ((await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair).privateKey;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256' }] }), { headers: { 'Cache-Control': 'max-age=3600' } }));
});
afterAll(() => vi.unstubAllGlobals());

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('correct horse batterz', h)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
  });
  it('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });
  it('rejects weak passwords', () => {
    expect(checkPassword('short')).toBeTruthy();
    expect(checkPassword('password')).toBeTruthy();
    expect(checkPassword('aaaaaaaaaa')).toBeTruthy();
    expect(checkPassword('a fine passphrase')).toBeNull();
  });
});

describe('Google ID tokens', () => {
  it('accepts a valid token', async () => {
    expect(await verifyGoogleToken(env, await sign(good()))).toEqual({ sub: '1234567890', email: 'player@gmail.com', name: undefined });
  });
  it('rejects a token signed by someone else', async () => {
    expect(await verifyGoogleToken(env, await sign(good(), otherPriv))).toHaveProperty('error');
  });
  it('rejects a tampered payload', async () => {
    const t = (await sign(good())).split('.');
    t[1] = enc({ ...good(), sub: 'attacker' });
    expect(await verifyGoogleToken(env, t.join('.'))).toHaveProperty('error');
  });
  it('rejects another app’s token', async () => {
    expect(await verifyGoogleToken(env, await sign({ ...good(), aud: 'someone-else' }))).toHaveProperty('error');
  });
  it('rejects a wrong issuer', async () => {
    expect(await verifyGoogleToken(env, await sign({ ...good(), iss: 'https://evil.example' }))).toHaveProperty('error');
  });
  it('rejects an expired token', async () => {
    expect(await verifyGoogleToken(env, await sign({ ...good(), exp: Math.floor(Date.now() / 1000) - 600 }))).toHaveProperty('error');
  });
  it('rejects an unverified email', async () => {
    expect(await verifyGoogleToken(env, await sign({ ...good(), email_verified: false }))).toHaveProperty('error');
  });
  it('is off without a client id', async () => {
    expect(await verifyGoogleToken({} as Env, await sign(good()))).toEqual({ error: 'Google sign-in isn’t set up yet.' });
  });
});
