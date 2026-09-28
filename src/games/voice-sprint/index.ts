import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'voice-sprint',
    version: '1.0.0',
    title: 'Voice Sprint',
    hook: 'Name all the animals you can in 40 seconds.',
    description:
      'A category is spoken and shown: animals, fruits, things that fly. Name as many as you can before the ring runs out. Every word that fits pops into a glowing constellation. Three rounds, three categories. Speak or type, in English or Hindi.',
    howTo: ['Hear the category', 'Name as many as you can', 'Each fitting word becomes a star'],
    controls: {
      touch: 'Tap the mic and speak (or type)',
      keyboard: [
        ['Space', 'Start speaking'],
        ['Type + Enter', 'Add words by typing'],
      ],
    },
    abilities: { primary: 'cognitive-flexibility', secondary: ['reading-fluency'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~2.5 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'The category is always shown on screen as well as spoken',
        'Relaxed timing lengthens each round; no time pressure makes rounds untimed with a 12-word goal',
        'Answer by speaking or by typing (separate words with spaces or commas)',
        'English and Hindi, including common Hinglish words',
      ],
    },
    palette: { bg: '#080a1c', bg2: '#1c1340', accent: '#ffd36e', accent2: '#7fd8ff', highlight: '#ffffff' },
    science: {
      paradigm: 'Category (semantic) verbal fluency',
      note: 'Designed around category fluency tasks, where people name as many members of a category as they can in a short time.',
      refs: ['Shao, Z., Janse, E., Visser, K., & Meyer, A. S. (2014). What do verbal fluency tasks measure? Frontiers in Psychology.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'best', label: 'Best round', unit: 'words', better: 'higher' },
      { key: 'total', label: 'Unique words', better: 'higher' },
      { key: 'categories', label: 'Categories played', better: 'higher' },
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
