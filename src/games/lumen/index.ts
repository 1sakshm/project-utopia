import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'lumen',
    version: '1.0.0',
    title: 'Lumen',
    hook: 'Turn the mirrors. Wake the sleeping crystals.',
    description:
      'A beam of light enters a floating sandstone temple. Rotate mirrors to guide it to every sleeping crystal. When all of them glow, the chamber folds away and the next one unfolds.',
    howTo: ['Tap a mirror to turn it', 'Guide the light beam to every crystal', 'Prisms split the beam in two', 'Fewer turns earn more stars'],
    controls: {
      touch: 'Tap a mirror to rotate it clockwise',
      keyboard: [
        ['Arrows', 'Select a mirror'],
        ['Space / E', 'Rotate clockwise'],
        ['Q', 'Rotate counter-clockwise'],
        ['H', 'Hint (costs a star)'],
      ],
    },
    abilities: { primary: 'planning', secondary: ['spatial-reasoning'] },
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
        'Sleeping crystals lie tilted and dim; awake crystals float upright with a ring',
        'No time pressure, fully keyboard playable',
        'Reduced motion replaces the chamber unfolding with a fade',
      ],
    },
    palette: { bg: '#1d1a3a', bg2: '#3b2f5e', accent: '#9ff6ff', accent2: '#f6c9a8', highlight: '#ffe6a8' },
    science: {
      paradigm: 'Open-ended spatial planning puzzle',
      note: 'Designed around spatial planning: imagining how a path of light changes before you act. Not based on a single lab paradigm.',
      refs: ['Unterrainer, J. M., & Owen, A. M. (2006). Planning and problem solving: from neuropsychology to functional neuroimaging. Journal of Physiology-Paris.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'stars', label: 'Stars', better: 'higher' },
      { key: 'chambers', label: 'Chambers solved', better: 'higher' },
      { key: 'perfect', label: 'Perfect chambers', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All geometry and sound procedurally generated'],
  },
  load: () => import('./game'),
});
