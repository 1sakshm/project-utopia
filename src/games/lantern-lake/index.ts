import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'lantern-lake',
    version: '1.0.0',
    title: 'Lantern Lake',
    hook: 'Relight the lanterns in the order they glowed.',
    description:
      'Paper lanterns float on a still, moonlit lake. A few glow one by one, then go dark. Relight them in the same order and watch them lift into the night sky together.',
    howTo: ['Watch lanterns glow one by one', 'Tap them in the same order', 'Mirror ✦: watch the reflections'],
    controls: {
      touch: 'Tap lanterns',
      keyboard: [
        ['Arrows + Space', 'Move focus ring and light'],
        ['1–4 · Q–R · A–F · Z–V', 'Light lantern by grid key (key hints)'],
      ],
    },
    abilities: { primary: 'spatial-memory', secondary: ['working-memory'] },
    engine: 'r3f',
    energy: 'calm',
    sessionLabel: '~3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Every lantern has its own paper pattern, not just a color',
        'No time limit when answering',
        'Reduced motion stops drifting and turns the rise into a fade',
        'Optional key letters on each lantern',
      ],
    },
    palette: { bg: '#060a17', bg2: '#15223f', accent: '#ffb35c', accent2: '#7fe0b0', highlight: '#ffe3a3' },
    science: {
      paradigm: 'Corsi block-tapping (visuospatial sequence span)',
      note: 'Designed around remembering where and in what order things appeared. Inspired by the Corsi block-tapping task.',
      refs: ['Corsi, P. M. (1972). Human memory and the medial temporal region of the brain.', 'Kessels, R. P. C. et al. (2000). The Corsi Block-Tapping Task: standardization and normative data. Applied Neuropsychology.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'bestSpan', label: 'Best span', better: 'higher' },
      { key: 'perfect', label: 'Lanterns released', better: 'higher' },
      { key: 'accuracy', label: 'Tap accuracy', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All geometry, textures and sound procedurally generated'],
  },
  load: () => import('./game'),
});
