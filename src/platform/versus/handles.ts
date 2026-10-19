// @handle rules, shared by the app (instant feedback) and the server (the real check).
// 3–20 characters: letters, numbers, _ and . — starting with a letter. Case-insensitive and unique.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
const HANDLE_RE = /^[a-z][a-z0-9_.]{2,19}$/i;

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'mod', 'moderator', 'staff', 'team', 'official',
  'utopia', 'playutopia', 'projectutopia', 'claude', 'anthropic', 'null', 'undefined', 'anonymous', 'everyone',
  'ghost', 'player', 'guest', 'me', 'you', 'settings', 'versus', 'friends', 'login', 'signup', 'api',
]);

// A short block list for obvious slurs/obscenity in handles. Deliberately small; extend as needed.
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'porn', 'dick', 'pussy', 'bitch', 'whore', 'slut', 'retard'];

/** Returns a human-readable problem, or null if the handle is allowed. */
export function checkHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, '');
  if (h.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`;
  if (h.length > HANDLE_MAX) return `At most ${HANDLE_MAX} characters.`;
  if (!/^[a-z]/i.test(h)) return 'Start with a letter.';
  if (!HANDLE_RE.test(h)) return 'Use letters, numbers, _ and . only.';
  if (/[_.]{2}/.test(h) || /[_.]$/.test(h)) return 'No doubled or trailing _ or .';
  const lower = h.toLowerCase();
  if (RESERVED.has(lower)) return `@${h} is reserved.`;
  if (BLOCKED.some((w) => lower.replace(/[_.0-9]/g, '').includes(w))) return 'Pick a different handle.';
  return null;
}

/** A handle-shaped version of a display name, e.g. "Swift Otter" → "swiftotter". */
export function slugHandle(name: string): string {
  let s = name
    .normalize('NFKD')
    .replace(/[^\w]/g, '')
    .replace(/_/g, '')
    .toLowerCase();
  if (!/^[a-z]/.test(s)) s = `p${s}`;
  s = s.slice(0, 14);
  return s.length >= HANDLE_MIN ? s : 'player';
}
