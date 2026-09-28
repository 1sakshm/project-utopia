import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'luna-says',
    version: '1.0.0',
    title: 'Luna Says',
    hook: 'Only move when Luna says so.',
    description:
      'Luna, a friendly glowing moon, gives quick commands in a Sarvam AI voice: tap a shape or swipe. Do it only when she starts with “Luna says”. If she doesn’t, hold still. Commands speed up and get trickier, with double taps and sneaky near-misses. English or Hindi.',
    howTo: ['“Luna says tap the star”: do it!', '“Tap the star” (no Luna says): hold still', 'Tap the four shapes or swipe anywhere'],
    controls: {
      touch: 'Tap a shape, or swipe anywhere',
      keyboard: [
        ['1–4', 'Star, circle, square, triangle'],
        ['Arrows', 'Swipe up, down, left, right'],
      ],
    },
    abilities: { primary: 'inhibition', secondary: ['selective-attention'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~2 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Shapes differ by outline and label, never by color alone',
        'With captions on, Luna’s words appear in her speech bubble',
        'Response windows grow with relaxed timing; “no time pressure” keeps them long and steady',
      ],
    },
    palette: { bg: '#0b0a20', bg2: '#221d4a', accent: '#ffe7a3', accent2: '#9fb6ff', highlight: '#fff6dc' },
    science: {
      paradigm: 'Go/no-go and Simon-says response inhibition',
      note: 'Inspired by go/no-go tasks: act on some spoken commands and hold back on others. It is a game, not an assessment.',
      refs: [
        'Strommen, E. A. (1973). Verbal self-regulation in a children’s game: impulsive errors on “Simon Says”. Child Development.',
        'Donders, F. C. (1868/1969). On the speed of mental processes. Acta Psychologica.',
      ],
    },
    scoreLabel: 'moonbeams',
    results: [
      { key: 'withholds', label: 'Correct holds', unit: '%', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
      { key: 'rt', label: 'Average response', unit: 'ms', better: 'lower' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'Voice: Sarvam AI (bulbul)', 'Art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
