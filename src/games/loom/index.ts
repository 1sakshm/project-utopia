import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'loom',
    version: '1.0.0',
    title: 'Loom',
    hook: 'Find the hidden rule. Weave the missing tile.',
    description:
      'A magical loom weaves a patterned tapestry, but one tile is missing. Study the rows and columns — shapes gaining sides, the weave turning, motifs multiplying, stitches cancelling — and choose the tile that completes the weave.',
    howTo: ['Study each row of woven tiles', 'Find the rule that changes', 'Pick the tile that fits the gap'],
    controls: {
      touch: 'Tap a candidate tile',
      keyboard: [['1–6', 'Choose a candidate tile']],
    },
    abilities: { primary: 'pattern-recognition', secondary: ['spatial-reasoning', 'working-memory'] },
    engine: 'pixi',
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
        'Rules never rely on color alone — color always follows shape',
        'High contrast gives monochrome tiles with bold strokes',
        'No time limit; large tiles; reduced motion places tiles instantly',
        'Screen-reader tile descriptions are a known limitation',
      ],
    },
    palette: { bg: '#140d16', bg2: '#2a1a26', accent: '#e9bb5c', accent2: '#5a97f2', highlight: '#ffe2a8' },
    science: {
      paradigm: 'Matrix reasoning (Raven-style progressive matrices)',
      note: 'Designed around matrix reasoning tasks such as Raven’s Progressive Matrices: inferring abstract rules from rows and columns of patterns.',
      refs: [
        'Raven, J. (2000). The Raven’s Progressive Matrices: Change and stability over culture and time. Cognitive Psychology.',
        'Carpenter, P. A., Just, M. A., & Shell, P. (1990). What one intelligence test measures. Psychological Review.',
      ],
    },
    scoreLabel: 'points',
    results: [
      { key: 'streak', label: 'Best first-try streak', better: 'higher' },
      { key: 'hardest', label: 'Hardest pattern solved (level)', better: 'higher' },
      { key: 'firstTry', label: 'Solved first try', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Utopia team', 'All art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
