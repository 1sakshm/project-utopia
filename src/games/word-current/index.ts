import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'word-current',
    version: '1.0.0',
    title: 'Word Current',
    hook: 'Real word or made-up? Read fast, sort true.',
    description:
      'Glowing leaves carry words down a night river. Send real words to the lantern bank on the left and made-up words like “blark” into the fog bank on the right. Build a streak and the current quickens.',
    howTo: ['Real word → swipe left (lanterns ✓)', 'Made-up word → swipe right (fog ✕)', 'Or tap the left / right half'],
    controls: {
      touch: 'Swipe left/right, or tap the labeled halves',
      keyboard: [
        ['← / A / F', 'Real word (lantern bank)'],
        ['→ / D / J', 'Not a word (fog bank)'],
      ],
    },
    abilities: { primary: 'reading-fluency', secondary: ['phonological-awareness', 'selective-attention'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Banks are labeled with ✓ / ✕ icons and words, never color alone',
        'Respects the reading-font and text-size settings; white text on a dark leaf',
        'Relaxed timing slows the river; “No time pressure” makes each leaf wait until sorted',
        'English only in this version',
      ],
    },
    palette: { bg: '#060c1c', bg2: '#12264a', accent: '#ffc46b', accent2: '#9fb8ff', highlight: '#fff3d6' },
    science: {
      paradigm: 'Lexical decision task',
      note: 'Designed around the lexical decision task used in reading research: quickly recognising whether a letter string is a real word.',
      refs: [
        'Meyer, D. E., & Schvaneveldt, R. W. (1971). Facilitation in recognizing pairs of words. Journal of Experimental Psychology.',
        'Keuleers, E., & Brysbaert, M. (2010). Wuggy: A multilingual pseudoword generator. Behavior Research Methods.',
      ],
    },
    scoreLabel: 'points',
    results: [
      { key: 'wpm', label: 'Words per minute', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
      { key: 'bestStreak', label: 'Best streak', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
