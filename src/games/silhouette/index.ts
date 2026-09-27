import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'silhouette',
    version: '1.0.0',
    title: 'Silhouette',
    hook: 'Turn the sculpture until its shadow fits.',
    description:
      'An abstract sculpture floats in a quiet gallery, lit by a single lamp. Rotate it in quarter turns until its shadow on the wall clicks into the etched outline. Sometimes you must pick, without turning, which sculpture could cast the shadow.',
    howTo: ['Match the shadow to the outline', 'Swipe or tap arrows to turn', 'Fewest turns earns a perfect star', 'Choice rounds: pick 1, 2 or 3'],
    controls: {
      touch: 'Swipe left/right/up/down or tap the arrow buttons; tap a sculpture in choice rounds',
      keyboard: [
        ['← →  /  A D', 'Turn left / right'],
        ['↑ ↓  /  W S', 'Tip up / down'],
        ['Q / E', 'Roll (later levels)'],
        ['1–3', 'Choose a sculpture'],
        ['H', 'Hint (costs points)'],
      ],
    },
    abilities: { primary: 'spatial-reasoning', secondary: ['visual-processing', 'planning'] },
    engine: 'r3f',
    energy: 'calm',
    sessionLabel: '~4 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Purely shape-based: no color is needed',
        'Discrete quarter-turn rotations, no time limit',
        'High contrast shows a black shadow on a white wall with a bold outline',
      ],
    },
    palette: { bg: '#1d1720', bg2: '#3a2c33', accent: '#f3ebe2', accent2: '#b88a52', highlight: '#ffe2a8' },
    science: {
      paradigm: 'Mental rotation (Shepard & Metzler)',
      note: 'Designed around mental rotation: imagining how a 3D object looks after turning it. Inspired by Shepard & Metzler’s classic studies.',
      refs: ['Shepard, R. N., & Metzler, J. (1971). Mental rotation of three-dimensional objects. Science, 171(3972), 701–703.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'perfect', label: 'Perfect solves', better: 'higher' },
      { key: 'choiceAcc', label: 'Choice accuracy', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All geometry and sound procedurally generated'],
  },
  load: () => import('./game'),
});
