import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'name-rush',
    version: '1.0.0',
    title: 'Name Rush',
    hook: 'A row of pictures. Name them all in one breath.',
    description:
      'A row of simple glowing pictures floats up: sun, fish, tree, key… Name them all aloud, left to right, as fast and cleanly as you can. Rows grow longer and more mixed as you go. Speak in English or Hindi, or type the names instead.',
    howTo: ['Look at the row of pictures', 'Tap the mic, name them left to right', 'Or type the names with spaces'],
    controls: {
      touch: 'Tap the mic and speak (or type)',
      keyboard: [
        ['Space', 'Start speaking'],
        ['Enter', 'Submit typed names'],
      ],
    },
    abilities: { primary: 'reading-fluency', secondary: ['phonological-awareness'] },
    engine: 'pixi',
    energy: 'active',
    sessionLabel: '~3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Answer by voice or by typing',
        'English and Hindi names accepted',
        'Colour rows are skipped in high-contrast mode',
        'No speed bonus with “no time pressure”',
      ],
    },
    palette: { bg: '#0a1020', bg2: '#1b2446', accent: '#ffd36b', accent2: '#7fe7ff', highlight: '#fff4d6' },
    science: {
      paradigm: 'Rapid automatized naming (RAN)',
      note: 'Designed around rapid automatized naming tasks, where a row of familiar pictures is named aloud as quickly and accurately as possible.',
      refs: ['Denckla, M. B., & Rudel, R. G. (1976). Rapid "automatized" naming (R.A.N.): dyslexia differentiated from other learning disabilities. Neuropsychologia.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'ips', label: 'Best speed', unit: 'items/s', better: 'higher' },
      { key: 'accuracy', label: 'Accuracy', unit: '%', better: 'higher' },
      { key: 'longest', label: 'Longest row', better: 'higher' },
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
