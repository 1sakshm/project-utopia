import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'firefly-night',
    version: '1.0.0',
    title: 'Firefly Night',
    hook: 'Catch fireflies. Spare the moths. Freeze at the chime.',
    description:
      'Twilight falls over the meadow. Catch glowing fireflies to fill your jar, but let the dusty moths fly by. When the wind chime rings and a ring sweeps the meadow, hold still — don’t tap.',
    howTo: ['Tap glowing round fireflies', 'Don’t tap triangle-winged moths', 'Chime + ring = freeze, don’t tap'],
    controls: {
      touch: 'Tap insects',
      keyboard: [['Space', 'Catch the newest insect']],
    },
    abilities: { primary: 'inhibition', secondary: ['reaction-timing', 'selective-attention'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~2 min',
    input: { requiresAudio: false, requiresFastReaction: true },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: false,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: ['Fireflies and moths differ by shape and glow, not color', 'Stop signal is both a sound and a visual ring', 'Blinking stays under 3 flashes per second'],
    },
    palette: { bg: '#0a1024', bg2: '#1d2150', accent: '#ffe27a', accent2: '#8ef0c8', highlight: '#fff4c2' },
    science: {
      paradigm: 'Go/no-go and stop-signal tasks',
      note: 'Designed around response inhibition: stopping a habitual action. Frequent fireflies build a tapping habit that moths and chimes ask you to hold back.',
      refs: ['Logan, G. D., & Cowan, W. B. (1984). On the ability to inhibit thought and action. Psychological Review.'],
    },
    scoreLabel: 'glow',
    results: [
      { key: 'caught', label: 'Fireflies caught', better: 'higher' },
      { key: 'calm', label: 'Calm hands (stops)', unit: '%', better: 'higher' },
      { key: 'avgCatch', label: 'Average catch', unit: 'ms', better: 'lower' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
