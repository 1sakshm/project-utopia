import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'digit-echo',
    version: '1.0.0',
    title: 'Digit Echo',
    hook: 'Hear the digits. Say them back, then backwards.',
    description:
      'A string of paper lanterns lights up as a warm Sarvam AI voice reads out digits, one at a time. Say the digits back (or type them). The string grows as you do, and ↺ rounds ask for the digits backwards. Play in English or Hindi.',
    howTo: ['Listen as each lantern lights a digit', 'Say the digits back in order', '↺ means: say them backwards'],
    controls: {
      touch: 'Tap the mic and speak (or type)',
      keyboard: [
        ['Space', 'Start speaking'],
        ['Type + Enter', 'Answer by typing'],
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
      notes: [
        'With captions on, each digit also appears in its lantern while it is spoken',
        'Answer by speaking or by typing',
        'No time limit when answering',
        'English and Hindi voices',
      ],
    },
    palette: { bg: '#0a0c1f', bg2: '#22163f', accent: '#ffc36b', accent2: '#8fd8ff', highlight: '#fff3d6' },
    science: {
      paradigm: 'Digit span (forward and backward)',
      note: 'Designed around the classic digit span task: holding a spoken sequence in working memory, with backward rounds inspired by backward digit span.',
      refs: ['Baddeley, A. (2003). Working memory: looking back and looking forward. Nature Reviews Neuroscience.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'longest', label: 'Longest forward', better: 'higher' },
      { key: 'backward', label: 'Longest backward', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
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
