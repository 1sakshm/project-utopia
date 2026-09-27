import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'prism-sort',
    version: '1.0.0',
    title: 'Prism Sort',
    hook: 'Find the hidden rule. Then notice when it changes.',
    description:
      'Crystals appear on a pedestal in a glowing temple. Send each one through the portal it belongs to. The rule — shape, count or pattern — is never told: discover it from the light, and stay alert, because it quietly changes. Later, a glyph sometimes tells you the rule outright, and it switches fast.',
    howTo: ['Send each crystal to a portal', 'Light = right. Find the hidden rule', 'The rule changes without warning', 'A glyph above = follow that rule'],
    controls: {
      touch: 'Swipe the crystal left/right, or tap a portal',
      keyboard: [
        ['← / A', 'Left portal'],
        ['→ / D', 'Right portal'],
      ],
    },
    abilities: { primary: 'cognitive-flexibility', secondary: ['pattern-recognition', 'inhibition'] },
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
      notes: [
        'Every attribute is shown by shape, count or surface pattern; color is only a redundant cue',
        'No time limit on any crystal',
        'High contrast: white crystals with bold dark patterns',
        'Discovering the unstated rule is the game itself',
      ],
    },
    palette: { bg: '#0a0818', bg2: '#1c1636', accent: '#a58bff', accent2: '#5ff2d6', highlight: '#ffe3a3' },
    science: {
      paradigm: 'Wisconsin Card Sorting Test / task switching',
      note: 'Designed around rule discovery and set-shifting, inspired by the Wisconsin Card Sorting Test. Cued trials are inspired by task-switching paradigms.',
      refs: [
        'Grant, D. A., & Berg, E. (1948). A behavioral analysis of degree of reinforcement and ease of shifting to new responses in a Weigl-type card-sorting problem. J. Exp. Psychol.',
        'Monsell, S. (2003). Task switching. Trends in Cognitive Sciences.',
      ],
    },
    scoreLabel: 'points',
    results: [
      { key: 'shifts', label: 'Shifts spotted', better: 'higher' },
      { key: 'perseverative', label: 'Stuck on old rule', better: 'lower' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Utopia team', 'All geometry, shaders and sound procedurally generated'],
  },
  load: () => import('./game'),
});
