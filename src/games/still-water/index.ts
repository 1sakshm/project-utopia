import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'still-water',
    version: '1.0.0',
    title: 'Still Water',
    hook: 'Breathe with a glowing lotus on a still pond.',
    description:
      'A single lotus floats on a dark, starlit pond. Hold as it opens to breathe in, release as it closes to breathe out. When a leaf or firefly drifts by, notice it with a gentle tap and return to the breath. Every few calm breaths, a new lotus blooms. There is no score and no way to fail.',
    howTo: ['Hold while the lotus opens: breathe in', 'Release as it closes: breathe out', 'Tap a drifting leaf or firefly to notice it'],
    controls: {
      touch: 'Touch and hold anywhere to breathe in, release to breathe out; tap drifting things',
      keyboard: [
        ['Space (hold)', 'Breathe in / release to breathe out'],
        ['N', 'Notice a drifting leaf or firefly'],
      ],
    },
    abilities: { primary: 'calm-attention', secondary: ['sustained-attention'] },
    engine: 'r3f',
    energy: 'calm',
    sessionLabel: '2–5 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: true,
      oneHanded: true,
      notes: [
        'No score, no failure, no time pressure',
        'Rising and falling breath tones make it playable by sound alone',
        'Tap-to-toggle and "Just watch" modes replace holding',
        'If breathing exercises feel uncomfortable, breathe naturally or use Just watch',
      ],
    },
    palette: { bg: '#050817', bg2: '#0f1a38', accent: '#f4b3dc', accent2: '#8fd8ff', highlight: '#ffe6b0' },
    science: {
      paradigm: 'Breath counting / focused-attention practice',
      note: 'Designed around breath-paced focused attention and gently noticing distractions, inspired by breath-counting practices. Not therapy or a treatment for anxiety.',
      refs: ['Levinson, D. B., Stoll, E. L., Kindy, S. D., Merry, H. L., & Davidson, R. J. (2014). A mind you can count on: validating breath counting as a behavioral measure of mindfulness. Frontiers in Psychology.'],
    },
    scoreLabel: 'breaths in sync',
    showScore: false,
    results: [
      { key: 'inSync', label: 'Breaths in sync' },
      { key: 'breaths', label: 'Breaths taken' },
      { key: 'noticed', label: 'Moments noticed' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All geometry, shaders and sound procedurally generated'],
  },
  load: () => import('./game'),
});
