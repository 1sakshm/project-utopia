import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'sound-sleuth',
    version: '1.0.0',
    title: 'Sound Sleuth',
    hook: 'Two words, one tiny difference. Can you hear it?',
    description:
      'Two sea shells each whisper a word. Were they the same word, or different? The pairs start easy (cat, hat) and get closer (cap, cat; ship, sheep) until three shells speak and you must find the odd one out. Play in English or Hindi.',
    howTo: ['Listen to each shell’s word', 'Tap Same or Different', 'Three shells? Find the odd one'],
    controls: {
      touch: 'Tap Same / Different (or a shell number)',
      keyboard: [
        ['← or S', 'Same'],
        ['→ or D', 'Different'],
        ['1–3', 'Odd one out'],
      ],
    },
    abilities: { primary: 'phonological-awareness', secondary: ['sustained-attention'] },
    engine: 'pixi',
    energy: 'calm',
    sessionLabel: '~2 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: false,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: ['No time limit when answering', 'Words are shown after each answer', 'English and Hindi voices'],
    },
    palette: { bg: '#07131f', bg2: '#10324a', accent: '#8ff0e0', accent2: '#ffb8a8', highlight: '#fff1d6' },
    science: {
      paradigm: 'Auditory minimal-pair discrimination',
      note: 'Designed around same/different judgements on minimal pairs, words that differ by a single sound.',
      refs: ['Wepman, J. M. (1960). Auditory discrimination, speech, and reading. The Elementary School Journal.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
      { key: 'hardest', label: 'Hardest level', better: 'higher' },
      { key: 'streak', label: 'Best streak', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'Voice: Sarvam AI (bulbul)', 'Art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
