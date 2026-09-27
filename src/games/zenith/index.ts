import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'zenith',
    version: '1.0.0',
    title: 'Zenith',
    hook: 'Tap as each comet crosses the zenith gate.',
    description:
      'Comets race around a tiny planet on glowing rings. Tap at the exact moment each one passes through the gate at the top of its orbit. Perfect hits burst into stardust that feeds the aurora around the planet. Later waves add more rings, speed changes and a moon that hides the comet on approach.',
    howTo: ['Watch a comet circle its ring', 'Tap as it crosses the top gate', 'More rings? Tap that ring (or J/K/L)', 'Behind the moon: predict it'],
    controls: {
      touch: 'Tap anywhere, or tap a ring when several are active',
      keyboard: [
        ['Space', 'Tap (nearest comet)'],
        ['J / K / L', 'Tap inner / middle / outer ring'],
      ],
    },
    abilities: { primary: 'reaction-timing', secondary: ['rhythm-timing', 'visuomotor-coordination'] },
    engine: 'r3f',
    energy: 'active',
    sessionLabel: '~2 min',
    input: { requiresAudio: false, requiresFastReaction: true },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: false,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Relaxed timing widens every window and slows the comets',
        'Rings are also coded by line style: solid, dashed, dotted',
        'Soft approach ticks announce each comet before the gate',
        'Grades are shown as words and symbols, not only color',
      ],
    },
    palette: { bg: '#05071a', bg2: '#161a44', accent: '#7af0ff', accent2: '#ff9ad5', highlight: '#ffe29a' },
    science: {
      paradigm: 'Coincidence-anticipation timing',
      note: 'Designed around coincidence-anticipation timing: predicting the exact moment a moving object reaches a target, including when it is briefly hidden.',
      refs: ['Belisle, J. J. (1963). Accuracy, reliability, and refractoriness in a coincidence-anticipation task. Research Quarterly.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'perfectPct', label: 'Perfect hits', unit: '%', better: 'higher' },
      { key: 'meanError', label: 'Mean timing error', unit: 'ms', better: 'lower' },
      { key: 'bestCombo', label: 'Best combo', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All geometry, shaders and sound procedurally generated'],
  },
  load: () => import('./game'),
});
