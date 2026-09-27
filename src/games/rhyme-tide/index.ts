import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'rhyme-tide',
    version: '1.0.0',
    title: 'Rhyme Tide',
    hook: 'Catch the shells that sound just right.',
    description:
      'A gentle voice says a word and shells wash in on the dusk tide. Tap the syllables in order to rebuild the word, or catch the shell that rhymes or starts with the same sound. Every right catch adds a pearl to your necklace.',
    howTo: ['Listen to the word (text shows too)', 'Build: tap syllables in order', 'Rhyme / Same start: tap the match', 'Tap the speaker to hear it again'],
    controls: {
      touch: 'Tap shells; tap the speaker to replay',
      keyboard: [
        ['1–5', 'Pick a shell (left to right)'],
        ['R', 'Replay the word'],
      ],
    },
    abilities: { primary: 'phonological-awareness', secondary: ['reading-fluency', 'working-memory'] },
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
        'Words are spoken and also shown as text on every shell',
        'Playable with sound off by reading (rhyme by spelling is imperfect)',
        'Respects the reading-font and text-size settings',
        'Untimed: shells wait for you; replay the voice as often as you like',
        'Task type is shown with an icon and a label, never color alone',
      ],
    },
    palette: { bg: '#1a1530', bg2: '#3b2d5c', accent: '#5fd3c8', accent2: '#ffb38a', highlight: '#fff1e0' },
    science: {
      paradigm: 'Phonological awareness tasks (syllable segmentation, rhyme and onset matching)',
      note: 'Designed around phonological awareness practice — hearing the parts of words — as used in early-reading research. This is practice, not a dyslexia intervention.',
      refs: [
        'Wagner, R. K., & Torgesen, J. K. (1987). The nature of phonological processing and its causal role in the acquisition of reading skills. Psychological Bulletin.',
        'Goswami, U., & Bryant, P. (1990). Phonological Skills and Learning to Read. Erlbaum.',
      ],
    },
    scoreLabel: 'points',
    results: [
      { key: 'pearls', label: 'Pearls strung', better: 'higher' },
      { key: 'accuracy', label: 'First-try accuracy', unit: '%', better: 'higher' },
      { key: 'longest', label: 'Longest word built', unit: 'syllables', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All art and sound procedurally generated', 'Voice: your device’s speech synthesis'],
  },
  load: () => import('./game'),
});
