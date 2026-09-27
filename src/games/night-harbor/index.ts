import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'night-harbor',
    version: '1.0.0',
    title: 'Night Harbor',
    hook: 'Keep the lighthouse watch. Ring only for the signal.',
    description:
      'You are the lighthouse keeper. All night, ships glide through the harbor showing lamp patterns. Ring the harbor bell only when a ship shows the signal on your panel — and stay sharp through the quiet stretches until dawn.',
    howTo: ['Learn the signal lamps on the panel', 'Ships pass showing ▲ ● ■ lamps', 'Tap only when a ship matches', 'Near-misses are traps — hold still'],
    controls: {
      touch: 'Tap anywhere (or the bell) for a signal ship',
      keyboard: [
        ['Space', 'Ring the bell'],
        ['Enter', 'Ring the bell'],
      ],
    },
    abilities: { primary: 'sustained-attention', secondary: ['inhibition', 'selective-attention'] },
    engine: 'pixi',
    energy: 'calm',
    sessionLabel: '~3.5 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: false,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Lamps are coded by shape (triangle, circle, square), not only color',
        'One-button input: tap anywhere or press Space — switch friendly',
        'Relaxed timing slows the ships',
        'The beam sweeps slowly with no strobing; reduced motion uses a steady spotlight',
      ],
    },
    palette: { bg: '#050a18', bg2: '#1a2446', accent: '#ffd27a', accent2: '#7fd4ff', highlight: '#fff3d6' },
    science: {
      paradigm: 'Continuous performance / vigilance task (CPT, SART family)',
      note: 'Designed around vigilance: staying ready to respond to rare targets over a long, calm stretch while holding back from near-miss lures.',
      refs: [
        'Rosvold, H. E., et al. (1956). A continuous performance test of brain damage. Journal of Consulting Psychology.',
        'Robertson, I. H., et al. (1997). “Oops!”: Performance correlates of everyday attentional failures. Neuropsychologia.',
      ],
    },
    scoreLabel: 'points',
    results: [
      { key: 'hitRate', label: 'Signal ships caught', unit: '%', better: 'higher' },
      { key: 'faRate', label: 'False alarms', unit: '%', better: 'lower' },
      { key: 'watch', label: 'Watch quality (1–5 lamps)', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
