// Pure prompt generation for Rhyme Tide (no engine imports).
import type { Rng } from '@/sdk';
import { RHYMING, WORDS, bySyllables, rhymesWith, type WordEntry } from './content';

export type Task = 'build' | 'rhyme' | 'onset';

export interface Prompt {
  task: Task;
  word: WordEntry; // the spoken prompt word
  target?: WordEntry; // rhyme / onset: the matching word
  options: string[]; // shell labels, left to right
  /** build: the syllables in order (matched by text, so repeated syllables like "na-na" work). others: [target label] */
  sequence: string[];
}

export interface LevelParams {
  tasks: Array<[Task, number]>; // weights
  choices: number; // shells for rhyme / onset
  near: number; // 0..1 chance distractors are "near" foils
  buildSyl: [number, number];
  buildDistractor: boolean;
}

export function levelParams(level: number): LevelParams {
  const L = Math.max(1, Math.min(10, level));
  const tasks: Array<[Task, number]> =
    L <= 1 ? [['rhyme', 2], ['build', 2]] : L <= 2 ? [['rhyme', 2], ['onset', 1], ['build', 2]] : [['rhyme', 1], ['onset', 1], ['build', 1.4]];
  return {
    tasks,
    choices: L <= 3 ? 3 : 4,
    near: L <= 3 ? 0 : L <= 5 ? 0.4 : 0.8,
    buildSyl: L <= 2 ? [2, 2] : L <= 4 ? [2, 3] : L <= 6 ? [3, 4] : L <= 8 ? [3, 5] : [4, 5],
    buildDistractor: L >= 5,
  };
}

function weighted<T>(rng: Rng, items: Array<[T, number]>): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = rng.next() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}

// Spelling endings that sound like each rhyme family — distractors must not end this way,
// so e.g. "hello" can never be a wrong answer for "snow", nor "kangaroo" for "zoo".
const END_SOUNDS: Record<string, string[]> = {
  ow: ['ow', 'o'],
  ee: ['ee', 'ea', 'ey', 'y'],
  oo: ['oo', 'ue', 'oe', 'ew'],
  ay: ['ay', 'ey', 'eigh'],
  air: ['air', 'ear', 'are'],
  ite: ['ite', 'ight'],
  ain: ['ain', 'ane'],
  ake: ['ake', 'ache'],
  oat: ['oat', 'ote'],
  ine: ['ine', 'ign'],
};

function endsLike(w: string, group: string | undefined): boolean {
  if (!group) return false;
  const ends = END_SOUNDS[group] ?? [group];
  return ends.some((e) => w.endsWith(e));
}

function pickFresh(rng: Rng, pool: WordEntry[], used: Set<string>): WordEntry {
  const fresh = pool.filter((e) => !used.has(e.w));
  return rng.pick(fresh.length ? fresh : pool);
}

const SYLLABLE_FOILS = ['ka', 'mo', 'ti', 'lun', 'per', 'dor', 'bi', 'fa', 'nel', 'sto', 'rup', 'gi'];

export function makePrompt(rng: Rng, level: number, used: Set<string>, forced?: { task: Task; word: string }): Prompt {
  const p = levelParams(level);
  const task = forced?.task ?? weighted(rng, p.tasks);
  if (task === 'build') {
    let word: WordEntry | undefined = forced ? WORDS.find((e) => e.w === forced.word) : undefined;
    if (!word) {
      const n = rng.int(p.buildSyl[0], p.buildSyl[1]);
      word = pickFresh(rng, bySyllables(n), used);
    }
    const options = [...word.syl];
    if (p.buildDistractor && !forced && options.length < 5) {
      const foils = SYLLABLE_FOILS.filter((f) => !word!.syl.includes(f));
      options.push(rng.pick(foils));
    }
    // shuffle, but never leave them already in order (that would be a free answer)
    let shuffled = rng.shuffle([...options]);
    for (let i = 0; i < 6 && shuffled.join('|').startsWith(word.syl.join('|')); i++) shuffled = rng.shuffle([...options]);
    if (forced && word.syl.length === 3) shuffled = [word.syl[1], word.syl[0], word.syl[2]];
    return { task, word, options: shuffled, sequence: [...word.syl] };
  }

  if (task === 'rhyme') {
    const word = pickFresh(rng, RHYMING, used);
    const target = rng.pick(RHYMING.filter((e) => rhymesWith(e, word)));
    const ok = (e: WordEntry) => e.w !== word.w && e.w !== target.w && e.rhyme !== word.rhyme && e.syl.length <= 2 && !endsLike(e.w, word.rhyme);
    const nearPool = WORDS.filter((e) => ok(e) && (e.onset === word.onset || e.onset === target.onset));
    const farPool = WORDS.filter(ok);
    const distract = pickDistinct(rng, p.choices - 1, rng.chance(p.near) ? nearPool : [], farPool, [word.w, target.w]);
    const options = rng.shuffle([target.w, ...distract.map((d) => d.w)]);
    return { task, word, target, options, sequence: [target.w] };
  }

  // onset: same first sound, but the target must not rhyme with the prompt (that would blur the task)
  let word: WordEntry;
  let targets: WordEntry[] = [];
  for (let tries = 0; tries < 20; tries++) {
    word = pickFresh(rng, WORDS.filter((e) => e.syl.length <= 2 && !e.onset.startsWith('vowel')), used);
    targets = WORDS.filter((e) => e.w !== word.w && e.onset === word.onset && !rhymesWith(e, word) && e.syl.length <= 3);
    if (targets.length) break;
  }
  word = word!;
  const target = rng.pick(targets);
  const nearPool = WORDS.filter((e) => e.onset !== word.onset && e.syl.length <= 2 && (rhymesWith(e, word) || rhymesWith(e, target)));
  const farPool = WORDS.filter((e) => e.onset !== word.onset && e.syl.length <= 2);
  const distract = pickDistinct(rng, p.choices - 1, rng.chance(p.near) ? nearPool : [], farPool, [word.w, target.w]);
  const options = rng.shuffle([target.w, ...distract.map((d) => d.w)]);
  return { task: 'onset', word, target, options, sequence: [target.w] };
}

function pickDistinct(rng: Rng, n: number, near: WordEntry[], far: WordEntry[], exclude: string[]): WordEntry[] {
  const out: WordEntry[] = [];
  const taken = new Set(exclude);
  const onsets = new Set<string>();
  const take = (pool: WordEntry[], max: number) => {
    const shuffled = rng.shuffle([...pool]);
    for (const e of shuffled) {
      if (out.length >= max) break;
      if (taken.has(e.w)) continue;
      // keep distractors different from each other (no two rhyming, no two with the same onset)
      if (out.some((o) => rhymesWith(o, e))) continue;
      if (onsets.has(e.onset)) continue;
      taken.add(e.w);
      onsets.add(e.onset);
      out.push(e);
    }
  };
  take(near, Math.min(n, 2));
  take(far, n);
  return out;
}
