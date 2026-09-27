import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'tidal-beat',
    version: '1.0.0',
    title: 'Tidal Beat',
    hook: 'Tap with the tide — then keep the beat when the music stops.',
    description:
      'Glowing waves roll onto a moonlit shore in time with the music. Tap as each wave crests to light up the sea. Then the music fades away and the rhythm is yours: keep tapping at the same tempo, and the waves will follow you.',
    howTo: ['Tap as each wave crests', 'Music fades? Keep the same beat', 'Steady taps make a calm sea'],
    controls: {
      touch: 'Tap anywhere',
      keyboard: [['Space / any key', 'Tap the beat']],
    },
    abilities: { primary: 'rhythm-timing', secondary: ['sustained-attention', 'reaction-timing'] },
    engine: 'pixi',
    energy: 'focused',
    sessionLabel: '~2–3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: false,
      visualOnlyPlayable: true,
      audioOnlyPlayable: true,
      oneHanded: true,
      notes: [
        'Visual beats: waves crest and a ring closes on the moon on every beat — playable with sound off (best with sound)',
        'First-run latency check (tap along 8 clicks) compensates for headphones and device delay',
        'Relaxed timing widens the grading windows; reduced motion swaps rolling waves for a pulsing horizon',
        'Grades are shown as words, never by color alone',
      ],
    },
    palette: { bg: '#060b1a', bg2: '#0f2440', accent: '#5ff5e6', accent2: '#9fb8ff', highlight: '#fff1c4' },
    science: {
      paradigm: 'Synchronization–continuation tapping',
      note: 'Designed around sensorimotor synchronization and internal timing: tapping along with a beat, then keeping it going on your own once the beat is gone.',
      refs: ['Repp, B. H. (2005). Sensorimotor synchronization: a review of the tapping literature. Psychonomic Bulletin & Review.'],
    },
    scoreLabel: 'glow',
    results: [
      { key: 'accuracy', label: 'Timing accuracy', unit: '%', better: 'higher' },
      { key: 'steadiness', label: 'Steadiness', unit: '%', better: 'higher' },
      { key: 'drift', label: 'Tempo drift', unit: '%', better: 'lower' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and music procedurally generated'],
  },
  load: () => import('./game'),
});
