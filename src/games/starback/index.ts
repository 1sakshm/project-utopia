import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'starback',
    version: '1.0.0',
    title: 'Starback',
    hook: 'Did this star land where one lit N stars ago?',
    description:
      'Stars ignite one by one across a deep night sky. Tap Match when a star lands in the same place as the star N steps back. Every correct match draws a golden filament, slowly revealing a hidden constellation that comes to life.',
    howTo: ['Stars light up one at a time', 'Tap Match if it’s where the star N back was', 'Otherwise, do nothing', 'Hits draw a hidden constellation'],
    controls: {
      touch: 'Tap Match (or anywhere in the lower half)',
      keyboard: [
        ['Space / M / Enter', 'Match'],
      ],
    },
    abilities: { primary: 'working-memory', secondary: ['spatial-memory', 'sustained-attention'] },
    engine: 'r3f',
    energy: 'focused',
    sessionLabel: '~3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: false,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Each of the 8 star positions has its own shape',
        'Optional position numbers (key hints)',
        'Single-button input works with switch access',
        'Relaxed timing slows the star rhythm',
      ],
    },
    palette: { bg: '#05061a', bg2: '#1a1446', accent: '#ffd479', accent2: '#8fb8ff', highlight: '#fff3d6' },
    science: {
      paradigm: 'Spatial n-back',
      note: 'Designed around continuously updating what you hold in working memory. Based on the spatial n-back paradigm.',
      refs: ['Jaeggi, S. M. et al. (2010). The concurrent validity of the N-back task as a working memory measure. Memory.', 'Owen, A. M. et al. (2005). N-back working memory paradigm: a meta-analysis of normative functional neuroimaging studies. Human Brain Mapping.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'highestN', label: 'Highest N', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
      { key: 'constellations', label: 'Constellations', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All constellations, textures and sound procedurally generated'],
  },
  load: () => import('./game'),
});
