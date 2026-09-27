import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'stonepath',
    version: '1.0.0',
    title: 'Stonepath',
    hook: 'Plan each move. Match the reflection.',
    description:
      'Glowing river stones rest on wooden pillars in a misty zen garden at dawn. Rearrange them to match the arrangement shown in the reflecting pool, in as few moves as possible. A perfect solve blooms a golden lotus.',
    howTo: ['Match the stones shown in the pool', 'Tap a pillar to lift its top stone', 'Tap another pillar to place it', 'Fewest moves earns a golden lotus'],
    controls: {
      touch: 'Tap a pillar to lift, tap another to place (or drag)',
      keyboard: [
        ['1–4', 'Lift from / place on pillar'],
        ['Z', 'Undo (costs the golden lotus)'],
        ['R', 'Reset puzzle'],
        ['Esc', 'Put the stone back'],
      ],
    },
    abilities: { primary: 'planning', secondary: ['working-memory', 'spatial-reasoning'] },
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
        'Stones differ by size and engraved symbol, not just color',
        'No time pressure; undo and reset are always available',
        'Reduced motion makes moves instant and stops falling petals',
      ],
    },
    palette: { bg: '#1c1830', bg2: '#3a2f55', accent: '#ffb8c8', accent2: '#9fe3cf', highlight: '#ffd98a' },
    science: {
      paradigm: 'Tower of London planning task',
      note: 'Designed around the Tower of London task: looking ahead and planning a sequence of moves before acting.',
      refs: ['Shallice, T. (1982). Specific impairments of planning. Philosophical Transactions of the Royal Society B.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'golden', label: 'Golden lotuses', better: 'higher' },
      { key: 'avgExtra', label: 'Avg. extra moves', better: 'lower' },
      { key: 'planSec', label: 'Planning time', unit: 's' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All geometry and sound procedurally generated'],
  },
  load: () => import('./game'),
});
