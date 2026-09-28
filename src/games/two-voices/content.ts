import type { VoiceLang } from '@/sdk';

/** Short, concrete, easy-to-picture words (mostly two syllables so the two voices overlap evenly). */
export const WORDS: Record<VoiceLang, string[]> = {
  'en-IN': [
    'apple', 'candle', 'pillow', 'rabbit', 'basket', 'window', 'garden', 'button', 'pencil', 'tiger', 'river', 'lemon',
    'rocket', 'monkey', 'turtle', 'kitten', 'parrot', 'carrot', 'ladder', 'muffin', 'jacket', 'teapot', 'puppy', 'tulip',
    'cookie', 'donkey', 'planet', 'bucket', 'feather', 'island', 'zebra', 'panda', 'mango', 'violin', 'balloon', 'dolphin',
  ],
  'hi-IN': [
    'कमल', 'पतंग', 'बादल', 'मछली', 'घोड़ा', 'तोता', 'किताब', 'कुर्सी', 'नदी', 'तारा', 'बंदर', 'हाथी',
    'टोपी', 'चाबी', 'गाजर', 'कलम', 'सड़क', 'मोती', 'बकरी', 'भालू', 'कछुआ', 'केला', 'दीपक', 'झूला',
    'चश्मा', 'थाली', 'डिब्बा', 'घड़ी', 'पत्ता', 'रोटी', 'जूता', 'शेर', 'मोर', 'चूहा', 'आलू', 'छाता',
  ],
};

export const UI: Record<
  VoiceLang,
  {
    listen: string;
    left: string;
    right: string;
    her: string;
    his: string;
    reportLeft: string;
    reportRight: string;
    reportBoth: string;
    listenBoth: string;
    pick: string;
    pickTwo: string;
    tip: string;
    seq: string;
  }
> = {
  'en-IN': {
    listen: 'LISTEN',
    left: 'LEFT',
    right: 'RIGHT',
    her: '♀ her voice',
    his: '♂ his voice',
    reportLeft: 'Which word came from the LEFT ear (her voice)?',
    reportRight: 'Which word came from the RIGHT ear (his voice)?',
    reportBoth: 'Tap BOTH words you heard',
    listenBoth: 'Listen to both ears…',
    pick: 'TAP THE WORD',
    pickTwo: 'TAP TWO WORDS',
    tip: '🎧 Best with headphones',
    seq: 'Device voice can’t play two voices at once, so you’ll hear her, then him.',
  },
  'hi-IN': {
    listen: 'सुनो',
    left: 'बायाँ',
    right: 'दायाँ',
    her: '♀ महिला आवाज़',
    his: '♂ पुरुष आवाज़',
    reportLeft: 'बाएँ कान में (महिला की आवाज़) कौन-सा शब्द था?',
    reportRight: 'दाएँ कान में (पुरुष की आवाज़) कौन-सा शब्द था?',
    reportBoth: 'दोनों सुने हुए शब्द चुनो',
    listenBoth: 'दोनों कानों से सुनो…',
    pick: 'शब्द चुनो',
    pickTwo: 'दो शब्द चुनो',
    tip: '🎧 हेडफ़ोन के साथ सबसे अच्छा',
    seq: 'डिवाइस की आवाज़ दो आवाज़ें एक साथ नहीं चला सकती, इसलिए पहले महिला, फिर पुरुष बोलेंगे।',
  },
};
