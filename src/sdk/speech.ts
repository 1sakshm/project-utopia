// Text helpers for voice games: normalize transcripts, compare fairly, parse spoken numbers.
// Works for English and Hindi (Devanagari). Engine-agnostic, no DOM.
import type { VoiceLang } from './types';

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Lowercase, strip punctuation (keeps Latin + Devanagari letters/marks/digits), collapse spaces, normalize digits. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const words = (s: string): string[] => normalizeText(s).split(' ').filter(Boolean);

/** Levenshtein edit distance (by Unicode code point). */
export function levenshtein(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[B.length];
}

/** 0..1 similarity of two phrases after normalization (1 = identical). */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x && !y) return 1;
  const d = levenshtein(x, y);
  return 1 - d / Math.max([...x].length, [...y].length, 1);
}

/** True if `heard` contains `target` as a word (or near-match, tolerant to STT spelling differences). */
export function heardWord(heard: string, target: string, tolerance = 0.75): boolean {
  const t = normalizeText(target);
  const ws = words(heard);
  if (ws.includes(t)) return true;
  // multi-word targets
  if (t.includes(' ') && normalizeText(heard).includes(t)) return true;
  return ws.some((w) => similarity(w, t) >= tolerance && Math.abs([...w].length - [...t].length) <= 2);
}

const EN_NUM: Record<string, number> = {
  zero: 0, oh: 0, o: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, fore: 4,
  five: 5, six: 6, sex: 6, seven: 7, eight: 8, ate: 8, nine: 9, niner: 9,
};
const HI_NUM: Record<string, number> = {
  शून्य: 0, ज़ीरो: 0, जीरो: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, छे: 6, सात: 7, आठ: 8, नौ: 9, नो: 9,
  shunya: 0, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhah: 6, che: 6, saat: 7, aath: 8, nau: 9,
};

/** Extract a sequence of single digits from a transcript: "3 5 7", "357", "three five seven", "तीन पाँच सात". */
export function parseDigits(transcript: string): number[] {
  const out: number[] = [];
  for (const w of words(transcript)) {
    if (/^\d+$/.test(w)) out.push(...[...w].map(Number));
    else if (w in EN_NUM) out.push(EN_NUM[w]);
    else if (w in HI_NUM) out.push(HI_NUM[w]);
  }
  return out;
}

/** Best match of a transcript among options (returns index or -1 if nothing is close enough). */
export function bestMatch(heard: string, options: string[], min = 0.6): number {
  let best = -1;
  let score = min;
  const ws = words(heard);
  options.forEach((opt, i) => {
    const s = Math.max(similarity(heard, opt), ...ws.map((w) => similarity(w, opt)));
    if (s >= score) {
      score = s;
      best = i;
    }
  });
  return best;
}

export const LANG_LABEL: Record<VoiceLang, string> = { 'en-IN': 'English', 'hi-IN': 'हिन्दी' };
