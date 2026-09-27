import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'glimpse',
    version: '1.0.0',
    title: 'Glimpse',
    hook: 'A split-second snapshot. What did you see — and where?',
    description:
      'The shutter opens for a split second: a creature sits in the middle and a star-shaped firefly glows somewhere at the edge. Then a soft pattern covers it all. Name the creature, then point to where the firefly was. The better you get, the shorter the glimpse.',
    howTo: ['Watch the centre of the lens', 'Pick the creature you saw', 'Tap where the star-firefly was'],
    controls: {
      touch: 'Tap a creature card, then a petal around the lens',
      keyboard: [
        ['1 – 4', 'Choose creature'],
        ['Numpad 1–9 / Arrows', 'Choose direction'],
        ['Q W E A D Z X C', 'Choose direction (compass)'],
      ],
    },
    abilities: { primary: 'visual-processing', secondary: ['selective-attention', 'divided-attention'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~2–3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Photosensitivity-safe: content appears at controlled brightness, never a white flash; the mask is low contrast',
        'Answers are untimed — only the glimpse itself is brief (a speed-of-seeing game)',
        'Creatures differ by silhouette, the firefly is a star shape; nothing relies on color',
        'Relaxed timing lengthens the glimpse; high contrast outlines every shape',
      ],
    },
    palette: { bg: '#120f14', bg2: '#2a2230', accent: '#f2c46d', accent2: '#7fd6c2', highlight: '#ffe9b0' },
    science: {
      paradigm: 'Useful Field of View (UFOV)-style brief exposure with backward masking',
      note: 'Designed around visual processing speed and the useful field of view: taking in the centre and the periphery of a scene in one brief look.',
      refs: ['Ball, K., & Owsley, C. (1993). The useful field of view test: a new technique for evaluating age-related declines in visual function. Journal of the American Optometric Association.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'glimpseMs', label: 'Glimpse speed', unit: 'ms', better: 'lower' },
      { key: 'peripheral', label: 'Firefly spotted', unit: '%', better: 'higher' },
      { key: 'center', label: 'Creature named', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
