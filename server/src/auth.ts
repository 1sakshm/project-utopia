// Passwords, device keys and Google sign-in.
//
// - Passwords: PBKDF2-SHA256 (100k rounds — the Workers maximum), random 16-byte salt, constant-time compare.
// - Device keys: every signed-in device gets its own random key; only its SHA-256 is stored (player_keys).
// - Google: the app gets an ID token from Google Identity Services; we verify its RS256 signature against Google's
//   published keys and check issuer, audience (our client id), expiry and that the email is verified.
import type { Env } from './util';

const PBKDF2_ITERATIONS = 100_000;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Returns a problem with the password, or null. */
export function checkPassword(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Enter a password.';
  if (pw.length < PASSWORD_MIN) return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return 'That password is too long.';
  if (/^(.)\1+$/.test(pw) || ['password', '12345678', 'qwertyui', '11111111'].includes(pw.toLowerCase())) return 'Pick a less guessable password.';
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, iter, salt, hash] = stored.split('$');
  if (algo !== 'pbkdf2-sha256' || !iter || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

// ---------- device keys ----------
export function randomKey(): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(40))].map((b) => a[b % 36]).join('');
}

// ---------- Google ----------
export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}
let jwks: { keys: Jwk[]; until: number } | null = null;

async function googleKeys(force = false): Promise<Jwk[]> {
  if (!force && jwks && jwks.until > Date.now()) return jwks.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('Could not load Google keys');
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1] ?? 3600);
  jwks = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
  return keys;
}

/** Verify a Google ID token. Returns the identity, or an error message. */
export async function verifyGoogleToken(env: Env, token: unknown): Promise<GoogleIdentity | { error: string }> {
  if (!env.GOOGLE_CLIENT_ID) return { error: 'Google sign-in isn’t set up yet.' };
  if (typeof token !== 'string' || token.split('.').length !== 3 || token.length > 4096) return { error: 'Bad Google token.' };
  const [h, p, s] = token.split('.');
  let header: { alg: string; kid: string };
  let claims: { iss: string; aud: string; exp: number; sub: string; email?: string; email_verified?: boolean | string; name?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(h)));
    claims = JSON.parse(new TextDecoder().decode(b64url(p)));
  } catch {
    return { error: 'Bad Google token.' };
  }
  if (header.alg !== 'RS256') return { error: 'Bad Google token.' };
  let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid); // keys rotate
  if (!jwk) return { error: 'Unknown Google signing key.' };
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return { error: 'Google token signature is invalid.' };
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return { error: 'Bad Google token issuer.' };
  const audiences = env.GOOGLE_CLIENT_ID.split(',').map((x) => x.trim());
  if (!audiences.includes(claims.aud)) return { error: 'This Google token is for a different app.' };
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) return { error: 'Google sign-in expired. Try again.' };
  if (!claims.email || (claims.email_verified !== true && claims.email_verified !== 'true')) return { error: 'Your Google email isn’t verified.' };
  return { sub: claims.sub, email: claims.email, name: claims.name };
}
