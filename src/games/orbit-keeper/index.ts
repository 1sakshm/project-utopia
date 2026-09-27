import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'orbit-keeper',
    version: '1.0.0',
    title: 'Orbit Keeper',
    hook: 'One touch. Weave a moon through rings of light.',
    description:
      'A little moon circles a pastel planet. Hold to pull its orbit inward, let go to drift back out. Thread it through glowing rings, swerve past rocks, and build harmony — every ring in a row adds a new layer to the music.',
    howTo: ['Hold to pull the moon inward', 'Let go to drift outward', 'Fly through rings, dodge rocks'],
    controls: {
      touch: 'Touch and hold anywhere',
      keyboard: [
        ['Space (hold)', 'Pull inward'],
        ['Enter', 'Toggle pull on/off (switch access)'],
      ],
    },
    abilities: { primary: 'visuomotor-coordination', secondary: ['sustained-attention', 'reaction-timing'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~90 s',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: false,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'One-button control, plus a toggle mode (Enter) for switch users',
        'Rings (open ellipses) and rocks (lumpy outlined shapes) differ by shape, not color',
        'Relaxed timing slows the orbit and widens rings; reduced motion removes shake and parallax',
      ],
    },
    palette: { bg: '#110a2a', bg2: '#2b1650', accent: '#8fe9ff', accent2: '#ff9fd0', highlight: '#ffe7a8' },
    science: {
      paradigm: 'Continuous pursuit-tracking tasks',
      note: 'Designed around visuomotor coordination: continuously steering toward moving targets with a single control, inspired by pursuit-tracking research.',
      refs: ['Poulton, E. C. (1974). Tracking skill and manual control. Academic Press.'],
    },
    scoreLabel: 'stardust',
    results: [
      { key: 'rings', label: 'Rings passed', better: 'higher' },
      { key: 'maxHarmony', label: 'Max harmony', better: 'higher' },
      { key: 'survival', label: 'Orbit time', unit: 's', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and music procedurally generated'],
  },
  load: () => import('./game'),
});
