import type { VoiceLang } from '@/sdk';
import type { IconId } from './icons';

export interface Item {
  id: IconId;
  /** Display names (shown on reveal). */
  name: Record<VoiceLang, string>;
  /** Accepted spoken/typed names: English, Hindi (Devanagari) and common romanized Hindi / STT spellings. */
  accept: string[];
  cat: 'object' | 'shape' | 'color';
}

export const ITEMS: Item[] = [
  { id: 'sun', cat: 'object', name: { 'en-IN': 'sun', 'hi-IN': 'सूरज' }, accept: ['sun', 'son', 'सूरज', 'सूर्य', 'suraj', 'sooraj', 'surya', 'सन'] },
  { id: 'moon', cat: 'object', name: { 'en-IN': 'moon', 'hi-IN': 'चाँद' }, accept: ['moon', 'चाँद', 'चांद', 'चंदा', 'चंद्रमा', 'chand', 'chaand', 'chanda', 'मून'] },
  { id: 'star', cat: 'object', name: { 'en-IN': 'star', 'hi-IN': 'तारा' }, accept: ['star', 'stars', 'तारा', 'तारे', 'सितारा', 'tara', 'taara', 'sitara', 'स्टार'] },
  { id: 'fish', cat: 'object', name: { 'en-IN': 'fish', 'hi-IN': 'मछली' }, accept: ['fish', 'मछली', 'machli', 'machhli', 'macchli', 'फिश'] },
  { id: 'tree', cat: 'object', name: { 'en-IN': 'tree', 'hi-IN': 'पेड़' }, accept: ['tree', 'trees', 'पेड़', 'पेड', 'वृक्ष', 'ped', 'per', 'पेड़', 'ट्री'] },
  { id: 'house', cat: 'object', name: { 'en-IN': 'house', 'hi-IN': 'घर' }, accept: ['house', 'home', 'hut', 'घर', 'मकान', 'ghar', 'makaan', 'makan', 'हाउस'] },
  { id: 'ball', cat: 'object', name: { 'en-IN': 'ball', 'hi-IN': 'गेंद' }, accept: ['ball', 'gend', 'गेंद', 'गेन्द', 'बॉल', 'बाल'] },
  { id: 'cup', cat: 'object', name: { 'en-IN': 'cup', 'hi-IN': 'कप' }, accept: ['cup', 'mug', 'कप', 'प्याला', 'kap', 'pyala'] },
  { id: 'key', cat: 'object', name: { 'en-IN': 'key', 'hi-IN': 'चाबी' }, accept: ['key', 'keys', 'चाबी', 'चाभी', 'कुंजी', 'chabi', 'chaabi', 'chabhi', 'की'] },
  { id: 'bird', cat: 'object', name: { 'en-IN': 'bird', 'hi-IN': 'चिड़िया' }, accept: ['bird', 'चिड़िया', 'चिड़िया', 'चिडिया', 'पक्षी', 'पंछी', 'chidiya', 'chidia', 'chiriya', 'बर्ड'] },
  { id: 'apple', cat: 'object', name: { 'en-IN': 'apple', 'hi-IN': 'सेब' }, accept: ['apple', 'सेब', 'seb', 'एप्पल', 'एपल'] },
  { id: 'flower', cat: 'object', name: { 'en-IN': 'flower', 'hi-IN': 'फूल' }, accept: ['flower', 'फूल', 'phool', 'phul', 'फ्लावर'] },
  { id: 'heart', cat: 'object', name: { 'en-IN': 'heart', 'hi-IN': 'दिल' }, accept: ['heart', 'दिल', 'dil', 'हार्ट'] },
  { id: 'cloud', cat: 'object', name: { 'en-IN': 'cloud', 'hi-IN': 'बादल' }, accept: ['cloud', 'clouds', 'बादल', 'badal', 'baadal', 'क्लाउड'] },
  { id: 'boat', cat: 'object', name: { 'en-IN': 'boat', 'hi-IN': 'नाव' }, accept: ['boat', 'ship', 'नाव', 'कश्ती', 'naav', 'nav', 'naw', 'बोट'] },
  { id: 'leaf', cat: 'object', name: { 'en-IN': 'leaf', 'hi-IN': 'पत्ता' }, accept: ['leaf', 'leave', 'पत्ता', 'पत्ती', 'patta', 'patti', 'लीफ'] },
  { id: 'bell', cat: 'object', name: { 'en-IN': 'bell', 'hi-IN': 'घंटी' }, accept: ['bell', 'घंटी', 'घण्टी', 'ghanti', 'बेल'] },
  { id: 'hat', cat: 'object', name: { 'en-IN': 'hat', 'hi-IN': 'टोपी' }, accept: ['hat', 'cap', 'टोपी', 'topi', 'हैट'] },
  { id: 'book', cat: 'object', name: { 'en-IN': 'book', 'hi-IN': 'किताब' }, accept: ['book', 'किताब', 'पुस्तक', 'kitab', 'kitaab', 'बुक'] },
  { id: 'umbrella', cat: 'object', name: { 'en-IN': 'umbrella', 'hi-IN': 'छाता' }, accept: ['umbrella', 'छाता', 'छतरी', 'chhata', 'chata', 'chhatri', 'अम्ब्रेला'] },
  { id: 'car', cat: 'object', name: { 'en-IN': 'car', 'hi-IN': 'गाड़ी' }, accept: ['car', 'गाड़ी', 'गाड़ी', 'गाडी', 'कार', 'gaadi', 'gadi', 'kar'] },
  { id: 'circle', cat: 'shape', name: { 'en-IN': 'circle', 'hi-IN': 'गोला' }, accept: ['circle', 'round', 'ring', 'गोला', 'गोल', 'वृत्त', 'gola', 'gol', 'सर्कल'] },
  { id: 'square', cat: 'shape', name: { 'en-IN': 'square', 'hi-IN': 'चौकोर' }, accept: ['square', 'box', 'चौकोर', 'चौकोना', 'वर्ग', 'chaukor', 'chokor', 'स्क्वायर'] },
  { id: 'triangle', cat: 'shape', name: { 'en-IN': 'triangle', 'hi-IN': 'तिकोना' }, accept: ['triangle', 'तिकोना', 'त्रिकोण', 'tikona', 'trikon', 'ट्रायंगल'] },
  { id: 'red', cat: 'color', name: { 'en-IN': 'red', 'hi-IN': 'लाल' }, accept: ['red', 'लाल', 'lal', 'laal', 'रेड'] },
  { id: 'blue', cat: 'color', name: { 'en-IN': 'blue', 'hi-IN': 'नीला' }, accept: ['blue', 'नीला', 'नीली', 'neela', 'nila', 'ब्लू'] },
  { id: 'green', cat: 'color', name: { 'en-IN': 'green', 'hi-IN': 'हरा' }, accept: ['green', 'हरा', 'हरी', 'hara', 'ग्रीन'] },
  { id: 'yellow', cat: 'color', name: { 'en-IN': 'yellow', 'hi-IN': 'पीला' }, accept: ['yellow', 'पीला', 'पीली', 'peela', 'pila', 'येलो'] },
];

/** Classic RAN uses a small set of very common pictures, repeated. The first levels draw from this set. */
export const STARTER: IconId[] = ['sun', 'fish', 'tree', 'ball', 'key'];

export const UI: Record<VoiceLang, { ready: string; go: string; sayAll: (n: number) => string; typeAll: (n: number) => string; heard: string }> = {
  'en-IN': {
    ready: 'GET READY',
    go: 'NAME THEM ALL',
    sayAll: (n) => `Say all ${n} names, left to right, in one breath`,
    typeAll: (n) => `Type all ${n} names, left to right, with spaces`,
    heard: 'Heard',
  },
  'hi-IN': {
    ready: 'तैयार हो जाओ',
    go: 'सबके नाम बोलो',
    sayAll: (n) => `बाएँ से दाएँ, सभी ${n} नाम एक साँस में बोलो`,
    typeAll: (n) => `बाएँ से दाएँ, सभी ${n} नाम लिखो (बीच में स्पेस)`,
    heard: 'सुना',
  },
};
