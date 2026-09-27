// Curated, child-safe English word bank for Rhyme Tide.
// Each word has: syllable split (spelling-based chunks that read naturally), an optional rhyme group
// (words in the same group rhyme in General American English), and an onset key = its first sound
// (so "cat" and "kite" share the onset "k", "phone" and "fish" share "f").

export interface WordEntry {
  w: string;
  syl: string[];
  rhyme?: string;
  onset: string;
}

// ---- rhyme families (mostly one syllable; a few two-syllable families)
const RHYMES: Record<string, string[]> = {
  at: ['cat', 'hat', 'bat', 'mat', 'rat', 'flat'],
  ake: ['cake', 'lake', 'snake', 'rake', 'bake'],
  ite: ['kite', 'light', 'night', 'white', 'bite'],
  og: ['dog', 'frog', 'log', 'fog'],
  un: ['sun', 'run', 'fun', 'bun'],
  ee: ['bee', 'tree', 'sea', 'key', 'three'],
  ing: ['ring', 'king', 'sing', 'swing', 'wing'],
  all: ['ball', 'wall', 'tall', 'fall', 'call'],
  ock: ['sock', 'rock', 'clock', 'block'],
  ain: ['rain', 'train', 'chain', 'brain'],
  air: ['bear', 'pear', 'chair', 'hair', 'stair'],
  oon: ['moon', 'spoon', 'noon', 'balloon'],
  ish: ['fish', 'dish', 'wish'],
  ug: ['bug', 'rug', 'mug', 'hug'],
  ox: ['box', 'fox'],
  ell: ['bell', 'shell', 'well', 'smell'],
  ip: ['ship', 'lip', 'drip', 'trip'],
  ow: ['snow', 'glow', 'grow', 'crow', 'slow'],
  ar: ['car', 'star', 'jar', 'far'],
  ed: ['bed', 'red', 'bread', 'sled'],
  oo: ['blue', 'shoe', 'glue', 'zoo'],
  ay: ['day', 'play', 'hay', 'tray', 'gray'],
  ace: ['face', 'lace', 'race', 'space'],
  oat: ['boat', 'goat', 'coat', 'float'],
  ine: ['nine', 'line', 'pine', 'vine'],
  unny: ['bunny', 'funny', 'sunny', 'money'],
  andy: ['candy', 'sandy', 'handy'],
  ower: ['flower', 'tower', 'shower'],
  ocket: ['pocket', 'rocket', 'locket'],
  itten: ['kitten', 'mitten'],
};

// Syllable splits for multi-syllable words (the rest are single syllables).
const SPLITS: Record<string, string> = {
  balloon: 'bal-loon',
  bunny: 'bun-ny',
  funny: 'fun-ny',
  sunny: 'sun-ny',
  money: 'mon-ey',
  candy: 'can-dy',
  sandy: 'san-dy',
  handy: 'han-dy',
  flower: 'flow-er',
  tower: 'tow-er',
  shower: 'show-er',
  pocket: 'pock-et',
  rocket: 'rock-et',
  locket: 'lock-et',
  kitten: 'kit-ten',
  mitten: 'mit-ten',
};

// ---- build words (2–5 syllables), grouped by length
const BUILD: string[] = [
  // 2 syllables
  'rab-bit', 'pen-cil', 'gar-den', 'win-dow', 'ba-by', 'pic-nic', 'pup-py', 'tur-tle', 'pan-da', 'mon-key',
  'ti-ger', 'cup-cake', 'sun-set', 'rain-bow', 'pump-kin', 'can-dle', 'ap-ple', 'but-ter', 'sis-ter', 'wa-ter',
  'pa-per', 'sea-shell', 'star-fish', 'pil-low', 'muf-fin', 'rob-in', 'ro-bot', 'jel-ly', 'cac-tus', 'dol-phin',
  'lem-on', 'mag-net', 'nap-kin', 'hel-lo', 'pea-nut', 'pi-rate', 'tea-pot', 'lad-der',
  // 3 syllables
  'but-ter-fly', 'el-e-phant', 'ba-na-na', 'cro-co-dile', 'di-no-saur', 'kan-ga-roo', 'to-ma-to', 'pa-ja-mas',
  'bi-cy-cle', 'lol-li-pop', 'oc-to-pus', 'um-brel-la', 'straw-ber-ry', 'com-pu-ter', 'hol-i-day', 'pi-an-o',
  'mu-se-um', 'mu-si-cian', 'po-ta-to', 'cin-na-mon', 'ad-ven-ture', 'vol-ca-no', 'an-i-mal', 'fam-i-ly',
  'yes-ter-day', 'mag-i-cal', 'ham-burg-er', 'sun-flow-er', 'bas-ket-ball', 'jel-ly-fish',
  // 4 syllables
  'wa-ter-mel-on', 'cat-er-pil-lar', 'al-li-ga-tor', 'hel-i-cop-ter', 'ma-ca-ro-ni', 'ar-ma-dil-lo',
  'har-mon-i-ca', 'cal-cu-la-tor', 'mo-tor-cy-cle', 'e-lev-a-tor', 'a-vo-ca-do', 'tel-e-vi-sion',
  // 5 syllables
  'hip-po-pot-a-mus', 'ref-rig-er-a-tor', 'un-i-ver-si-ty', 'vo-cab-u-lar-y', 'op-por-tu-ni-ty',
];

// Words whose first sound differs from their first letter.
const ONSET_OVERRIDE: Record<string, string> = {
  cinnamon: 's',
  city: 's',
  knee: 'n',
  phone: 'f',
  wrap: 'r',
  university: 'y',
  one: 'w',
};

const DIGRAPHS: Array<[string, string]> = [
  ['sh', 'sh'],
  ['ch', 'ch'],
  ['th', 'th'],
  ['wh', 'w'],
  ['ph', 'f'],
  ['kn', 'n'],
  ['wr', 'r'],
  ['qu', 'k'],
];

export function onsetOf(w: string): string {
  if (ONSET_OVERRIDE[w]) return ONSET_OVERRIDE[w];
  for (const [d, k] of DIGRAPHS) if (w.startsWith(d)) return k;
  const c = w[0];
  if (c === 'c') return /^c[eiy]/.test(w) ? 's' : 'k';
  if (c === 'g' && /^g[ei]/.test(w) && w !== 'get' && w !== 'give') return 'j';
  if ('aeiou'.includes(c)) return 'vowel-' + c; // vowels: only match the same written vowel
  return c;
}

function build(): WordEntry[] {
  const out: WordEntry[] = [];
  const seen = new Set<string>();
  for (const [group, words] of Object.entries(RHYMES)) {
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      const syl = SPLITS[w] ? SPLITS[w].split('-') : [w];
      out.push({ w, syl, rhyme: group, onset: onsetOf(w) });
    }
  }
  for (const s of BUILD) {
    // 'mu-se-um' is a typo guard: we never want a fake syllable; skip malformed splits
    const syl = s.split('-');
    const w = syl.join('');
    if (seen.has(w) || w.endsWith('ee') && s.includes('-e') && syl[syl.length - 1] === 'e') continue;
    seen.add(w);
    out.push({ w, syl, onset: onsetOf(w) });
  }
  return out;
}

export const WORDS: WordEntry[] = build();

export const RHYMING: WordEntry[] = WORDS.filter((e) => e.rhyme && WORDS.filter((o) => o.rhyme === e.rhyme).length >= 2);

export function bySyllables(n: number): WordEntry[] {
  return WORDS.filter((e) => e.syl.length === n);
}

export function rhymesWith(a: WordEntry, b: WordEntry): boolean {
  return !!a.rhyme && a.rhyme === b.rhyme && a.w !== b.w;
}
