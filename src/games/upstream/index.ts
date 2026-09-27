import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'upstream',
    version: '1.0.0',
    title: 'Upstream',
    hook: 'Follow the crowned koi. Ignore the school.',
    description:
      'A school of ink-wash koi glides through a paper pond. Swipe the way the crowned lead koi is facing — even when the fish around it point the other way.',
    howTo: ['Find the crowned koi in the ring', 'Swipe the way it faces', 'Ignore the other koi', 'Later: up and down too'],
    controls: {
      touch: 'Swipe the direction — or tap a side (quadrant in 4-way mode)',
      keyboard: [
        ['← → ↑ ↓', 'Direction the crowned koi faces'],
        ['W A S D', 'Same as arrows'],
      ],
    },
    abilities: { primary: 'inhibition', secondary: ['selective-attention', 'reaction-timing'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~2.5 min',
    input: { requiresAudio: false, requiresFastReaction: true },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'The lead koi is marked by size, a crown crest, an ink ring and position — not color',
        'Tap halves or quadrants instead of swiping',
        'Untimed mode removes the response window',
        'Reduced motion: no petals and gentler darts',
      ],
    },
    palette: { bg: '#1c1a18', bg2: '#efe6d2', accent: '#c8452d', accent2: '#d9a441', highlight: '#f7f1e3' },
    science: {
      paradigm: 'Eriksen flanker task',
      note: 'Designed around interference control: responding to one central cue while neighbouring cues pull toward a different answer.',
      refs: ['Eriksen, B. A., & Eriksen, C. W. (1974). Effects of noise letters upon the identification of a target letter in a nonsearch task. Perception & Psychophysics.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'incAcc', label: 'Focus under pressure (incongruent accuracy)', unit: '%', better: 'higher' },
      { key: 'avgRt', label: 'Average response', unit: 'ms', better: 'lower' },
      { key: 'bestStreak', label: 'Best streak', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
