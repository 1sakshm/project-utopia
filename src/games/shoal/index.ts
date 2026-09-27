import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'shoal',
    version: '1.0.0',
    title: 'Shoal',
    hook: 'Keep your eyes on the golden fish as the school swirls.',
    description:
      'A school of identical glowing fish circles a moonlit reef pool. A few glow gold for a moment, then blend back in. Follow them through the swirl, and when the school stops, find the ones that were tagged.',
    howTo: ['Remember the fish that glow gold', 'Follow them as the school swirls', 'When it stops, tap the tagged fish'],
    controls: {
      touch: 'Tap fish (tap again to unselect)',
      keyboard: [
        ['1–9, 0, Q–Y', 'Select numbered fish (after the school stops)'],
      ],
    },
    abilities: { primary: 'divided-attention', secondary: ['selective-attention', 'visual-processing'] },
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
        'Tagged fish get a ring, a glow and an outline pulse — not just a color',
        'No time limit when choosing',
        'Relaxed timing slows the swim',
        'Reduced motion keeps paths slower and smoother (the motion itself is the task)',
        'Numbered fish for keyboard play',
      ],
    },
    palette: { bg: '#03141c', bg2: '#0a3a48', accent: '#6ff5e6', accent2: '#ff9ec7', highlight: '#ffd36b' },
    science: {
      paradigm: 'Multiple object tracking (MOT)',
      note: 'Designed around keeping several moving objects in mind at once. Based on the multiple object tracking paradigm (Pylyshyn & Storm).',
      refs: ['Pylyshyn, Z. W., & Storm, R. W. (1988). Tracking multiple independent targets: evidence for a parallel tracking mechanism. Spatial Vision.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'bestStreak', label: 'Perfect streak', better: 'higher' },
      { key: 'maxTracked', label: 'Most fish tracked', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Utopia team', 'All fish, reef and sound procedurally generated'],
  },
  load: () => import('./game'),
});
