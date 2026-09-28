import type { VoiceLang } from '@/sdk';

/** Concrete, easy-to-picture, child-safe nouns. Same meanings in both languages (index-aligned). */
export const WORDS: Record<VoiceLang, string[]> = {
  'en-IN': [
    'apple', 'river', 'moon', 'tiger', 'chair', 'lamp', 'boat', 'bread', 'star', 'drum', 'kite', 'rain', 'cloud', 'flower',
    'horse', 'window', 'mango', 'bell', 'train', 'garden', 'candle', 'mirror', 'pillow', 'rabbit', 'forest', 'bottle', 'feather',
    'button', 'ladder', 'basket', 'turtle', 'pencil', 'rocket', 'island', 'violin', 'peacock', 'lemon', 'bridge', 'shell', 'honey',
  ],
  'hi-IN': [
    'सेब', 'नदी', 'चाँद', 'बाघ', 'कुर्सी', 'दीपक', 'नाव', 'रोटी', 'तारा', 'ढोल', 'पतंग', 'बारिश', 'बादल', 'फूल',
    'घोड़ा', 'खिड़की', 'आम', 'घंटी', 'रेलगाड़ी', 'बगीचा', 'मोमबत्ती', 'आईना', 'तकिया', 'खरगोश', 'जंगल', 'बोतल', 'पंख',
    'बटन', 'सीढ़ी', 'टोकरी', 'कछुआ', 'पेंसिल', 'रॉकेट', 'टापू', 'वायलिन', 'मोर', 'नींबू', 'पुल', 'सीप', 'शहद',
  ],
};
