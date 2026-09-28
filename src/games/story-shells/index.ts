import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'story-shells',
    version: '1.0.0',
    title: 'Story Shells',
    hook: 'A seashell tells a tiny story. What happened?',
    description:
      'A glowing seashell opens and tells a short story in a warm Sarvam AI voice. Listen closely, then answer two questions by tapping a picture card. Stories grow longer as you go, and later questions ask what happened first or last. Play in English or Hindi.',
    howTo: ['Listen to the shell’s little story', 'Tap the card that answers each question', 'Hear it again once (for half points)'],
    controls: {
      touch: 'Tap a choice card',
      keyboard: [
        ['1–3', 'Choose a card'],
        ['R', 'Hear the story again'],
      ],
    },
    abilities: { primary: 'sustained-attention', secondary: ['phonological-awareness'] },
    engine: 'pixi',
    energy: 'calm',
    sessionLabel: '~3 min',
    input: { requiresAudio: true, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: ['With captions on, each sentence is shown as it is spoken', 'No time limit when answering', 'English and Hindi voices'],
    },
    palette: { bg: '#07121f', bg2: '#16324a', accent: '#8ff0e0', accent2: '#ffb8d2', highlight: '#fff1c9' },
    science: {
      paradigm: 'Listening comprehension (spoken narrative recall)',
      note: 'Designed around following a short spoken story and recalling who, what, where and in which order. It is a game, not an assessment.',
      refs: ['Kintsch, W. (1988). The role of knowledge in discourse comprehension: a construction-integration model. Psychological Review.'],
    },
    scoreLabel: 'pearls',
    results: [
      { key: 'accuracy', label: 'Questions right', unit: '%', better: 'higher' },
      { key: 'stories', label: 'Stories completed', better: 'higher' },
      { key: 'longest', label: 'Longest story (sentences)', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'Voice: Sarvam AI (bulbul)', 'Stories written for Utopia', 'Art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
