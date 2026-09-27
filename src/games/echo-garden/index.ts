import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'echo-garden',
    version: '1.0.0',
    title: 'Echo Garden',
    hook: 'Repeat the song the garden sings.',
    description:
      'A moonlit garden of glowing flowers sings you a melody. Sing it back by touching the flowers in the same order, and watch the garden grow. Later, the moon asks you to sing it backwards.',
    howTo: ['Watch & listen as flowers bloom in order', 'Tap the flowers in the same order', 'Moon icon ↺ means: repeat it backwards'],
    controls: {
      touch: 'Tap flowers',
      keyboard: [
        ['1–9', 'Tap flower (turn on key hints in settings)'],
        ['R', 'Hear the song again'],
      ],
    },
    abilities: { primary: 'working-memory', secondary: ['spatial-memory'] },
    engine: 'r3f',
    energy: 'focused',
    sessionLabel: '~3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: ['Every flower has a unique shape, not just a color', 'No time limit when answering', 'Optional number hints on flowers'],
    },
    palette: { bg: '#0b0d1f', bg2: '#1b1640', accent: '#b99cff', accent2: '#6fe3ff', highlight: '#ffe8a8' },
    science: {
      paradigm: 'Serial recall / span tasks (Simon-style sequence memory)',
      note: 'Designed around holding and reproducing a growing sequence in working memory. Reverse trials are inspired by backward span tasks.',
      refs: ['Baddeley, A. (2003). Working memory: looking back and looking forward. Nature Reviews Neuroscience.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'longest', label: 'Longest song', better: 'higher' },
      { key: 'longestReverse', label: 'Longest reverse', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All geometry and sound procedurally generated'],
  },
  load: () => import('./game'),
});
