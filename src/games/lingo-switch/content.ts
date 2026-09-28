import type { IconId } from './icons';

/** Index-aligned bilingual picture words. `cat` groups similar meanings (used for harder distractors). */
export interface Concept {
  id: IconId;
  en: string;
  hi: string;
  cat: 'sky' | 'nature' | 'living' | 'home' | 'play' | 'travel';
}

export const CONCEPTS: Concept[] = [
  { id: 'sun', en: 'sun', hi: 'सूरज', cat: 'sky' },
  { id: 'moon', en: 'moon', hi: 'चाँद', cat: 'sky' },
  { id: 'star', en: 'star', hi: 'तारा', cat: 'sky' },
  { id: 'cloud', en: 'cloud', hi: 'बादल', cat: 'sky' },
  { id: 'tree', en: 'tree', hi: 'पेड़', cat: 'nature' },
  { id: 'flower', en: 'flower', hi: 'फूल', cat: 'nature' },
  { id: 'leaf', en: 'leaf', hi: 'पत्ता', cat: 'nature' },
  { id: 'drop', en: 'water', hi: 'पानी', cat: 'nature' },
  { id: 'fish', en: 'fish', hi: 'मछली', cat: 'living' },
  { id: 'bird', en: 'bird', hi: 'चिड़िया', cat: 'living' },
  { id: 'apple', en: 'apple', hi: 'सेब', cat: 'living' },
  { id: 'egg', en: 'egg', hi: 'अंडा', cat: 'living' },
  { id: 'cup', en: 'cup', hi: 'प्याला', cat: 'home' },
  { id: 'key', en: 'key', hi: 'चाबी', cat: 'home' },
  { id: 'bell', en: 'bell', hi: 'घंटी', cat: 'home' },
  { id: 'clock', en: 'clock', hi: 'घड़ी', cat: 'home' },
  { id: 'ball', en: 'ball', hi: 'गेंद', cat: 'play' },
  { id: 'hat', en: 'hat', hi: 'टोपी', cat: 'play' },
  { id: 'book', en: 'book', hi: 'किताब', cat: 'play' },
  { id: 'umbrella', en: 'umbrella', hi: 'छाता', cat: 'play' },
  { id: 'car', en: 'car', hi: 'गाड़ी', cat: 'travel' },
  { id: 'boat', en: 'boat', hi: 'नाव', cat: 'travel' },
  { id: 'house', en: 'house', hi: 'घर', cat: 'travel' },
  { id: 'heart', en: 'heart', hi: 'दिल', cat: 'travel' },
];
