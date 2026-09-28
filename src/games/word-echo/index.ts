import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'word-echo',
    version: '1.0.0',
    title: 'Word Echo',
    hook: 'Listen to the words. Tap them back in order.',
    description:
      'A glowing orb speaks a short list of words in a warm Sarvam AI voice. Tap the words back in the order you heard them. The lists grow as you do, and later the orb asks for them backwards. Play in English or Hindi.',
    howTo: ['Listen as the orb speaks each word', 'Tap the words in the same order', '↺ means: tap them backwards'],
    controls: {
      touch: 'Tap word cards',
      keyboard: [
        ['1–9', 'Tap a card'],
        ['R', 'Hear the list again'],
      ],
    },
    abilities: { primary: 'working-memory', secondary: ['phonological-awareness'] },
    engine: 'pixi',
    energy: 'focused',
    sessionLabel: '~3 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: ['With captions on, each word also appears in the orb', 'No time limit when answering', 'English and Hindi voices'],
    },
    palette: { bg: '#081424', bg2: '#123049', accent: '#7fe7ff', accent2: '#b99cff', highlight: '#fff1c9' },
    science: {
      paradigm: 'Auditory verbal span (word span) tasks',
      note: 'Designed around holding a spoken sequence in auditory working memory; reverse rounds are inspired by backward span tasks.',
      refs: ['Baddeley, A. (2003). Working memory: looking back and looking forward. Nature Reviews Neuroscience.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'longest', label: 'Longest list', better: 'higher' },
      { key: 'reverse', label: 'Longest reverse', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'Voice: Sarvam AI (bulbul)', 'Art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
