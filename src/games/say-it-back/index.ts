import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'say-it-back',
    version: '1.0.0',
    title: 'Say It Back',
    hook: 'Hear it, then say it back. Twisters included.',
    description:
      'A warm Sarvam AI voice says a word or phrase while a ribbon of sound draws itself across the sky. Say it back (or type it) and watch the words you matched light up. Words grow into phrases and, later, gentle tongue-twisters. Play in English or Hindi.',
    howTo: ['Listen to the word or phrase', 'Say it back exactly', 'Matched words glow'],
    controls: {
      touch: 'Tap the mic and speak (or type)',
      keyboard: [
        ['Space', 'Start speaking'],
        ['Type + Enter', 'Answer by typing'],
        ['R', 'Hear again (once)'],
      ],
    },
    abilities: { primary: 'phonological-awareness', secondary: ['working-memory'] },
    engine: 'pixi',
    energy: 'calm',
    sessionLabel: '~2 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'With captions on, the phrase is shown while it is spoken and again after you answer',
        'Answer by speaking or by typing',
        'No time limit when answering',
        'English and Hindi voices',
      ],
    },
    palette: { bg: '#07101f', bg2: '#1a1a44', accent: '#8ff0e0', accent2: '#c7a4ff', highlight: '#fff0c4' },
    science: {
      paradigm: 'Verbal (word and phrase) repetition',
      note: 'Designed around verbal repetition tasks, which lean on the phonological loop: briefly holding and reproducing the sounds of speech.',
      refs: ['Baddeley, A., Gathercole, S., & Papagno, C. (1998). The phonological loop as a language learning device. Psychological Review.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'perfect', label: 'Perfect repeats', better: 'higher' },
      { key: 'match', label: 'Average match', unit: '%', better: 'higher' },
      { key: 'longest', label: 'Longest phrase', unit: 'words', better: 'higher' },
    ],
    credits: [
      'Design & code: Saksham Sharma (& Claude)',
      'Voice: Sarvam AI (bulbul)',
      'Speech recognition: Sarvam AI (saaras)',
      'Art and sound procedurally generated',
    ],
  },
  load: () => import('./game'),
});
