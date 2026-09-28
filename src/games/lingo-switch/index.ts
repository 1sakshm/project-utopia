import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'lingo-switch',
    version: '1.0.0',
    title: 'Lingo Switch',
    hook: 'English or Hindi? Hear a word, tap its picture.',
    description:
      'A word is spoken, sometimes in English, sometimes in Hindi, switching without warning. Tap the picture it names. Each card carries the word in the other language, so your mind hops between both. The pace quickens and the pictures get closer in meaning as you go.',
    howTo: ['Listen: English or Hindi', 'Tap the matching picture', 'Stay quick when the language switches'],
    controls: {
      touch: 'Tap a picture card',
      keyboard: [['1–4', 'Pick a card']],
    },
    abilities: { primary: 'cognitive-flexibility', secondary: ['phonological-awareness'] },
    engine: 'pixi',
    energy: 'focused',
    sessionLabel: '~2 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: false,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'With captions on, the spoken word appears in its bubble',
        'Language is shown by side, colour and an EN / हि badge',
        'No answer time limit with “no time pressure”',
      ],
    },
    palette: { bg: '#0b1022', bg2: '#1c1d44', accent: '#7fe7ff', accent2: '#ffb86b', highlight: '#fff1c9' },
    science: {
      paradigm: 'Bilingual language switching (switch cost)',
      note: 'Designed around language-switching tasks, which compare responses on trials where the language changes with trials where it repeats.',
      refs: ['Meuter, R. F. I., & Allport, A. (1999). Bilingual language switching in naming: asymmetrical costs of language selection. Journal of Memory and Language.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
      { key: 'switchCost', label: 'Switch cost', unit: 'ms', better: 'lower' },
      { key: 'streak', label: 'Best streak', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'Voice: Sarvam AI (bulbul)', 'Art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
