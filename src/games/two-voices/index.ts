import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'two-voices',
    version: '1.0.0',
    title: 'Two Voices',
    hook: 'Two voices, two ears, one moment. What did she say?',
    description:
      'A woman speaks in your left ear and a man in your right, at the very same moment, each saying a different word (Sarvam AI voices). Tap the word from the ear you were asked about. Later the question only comes after the words, and then you catch both. Best with headphones. English or Hindi.',
    howTo: ['Left ear: her voice. Right ear: his voice', 'Both speak a word at the same time', 'Tap the word from the ear you’re asked about'],
    controls: {
      touch: 'Tap a word card',
      keyboard: [['1–4', 'Choose a word']],
    },
    abilities: { primary: 'divided-attention', secondary: ['selective-attention'] },
    engine: 'pixi',
    energy: 'focused',
    sessionLabel: '~2 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Best with headphones (stereo)',
        'Ears are shown by position, an ear icon and a label, never by color alone',
        'With captions on, both words appear briefly beside each ear',
        'Without Sarvam voices, the words play one after another',
      ],
    },
    palette: { bg: '#0a0f22', bg2: '#1c1f45', accent: '#ffb3d9', accent2: '#8fd8ff', highlight: '#fff1c9' },
    science: {
      paradigm: 'Dichotic listening',
      note: 'Inspired by dichotic listening tasks, where different words reach each ear at once and attention is directed to one or both. It is a game, not a hearing test.',
      refs: ['Hugdahl, K. (2011). Fifty years of dichotic listening research: still going and going and… Brain and Cognition.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
      { key: 'cued', label: 'Cued accuracy', unit: '%', better: 'higher' },
      { key: 'uncued', label: 'Uncued accuracy', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'Voice: Sarvam AI (bulbul)', 'Art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
