import type { VoiceLang } from '@/sdk';

/**
 * Prompts by level: 1 = single words, 2 = short 2–3 word phrases, 3 = longer phrases, 4 = gentle tongue-twisters.
 * Child-safe, everyday, easy to picture.
 */
export const PROMPTS: Record<VoiceLang, string[][]> = {
  'en-IN': [
    [
      'sunshine', 'butterfly', 'pencil', 'rainbow', 'elephant', 'window', 'banana', 'umbrella', 'garden', 'tiger',
      'blanket', 'orange', 'rocket', 'puzzle', 'dolphin', 'lantern',
    ],
    [
      'blue sky', 'happy birthday', 'green apple', 'soft pillow', 'big red ball', 'hot tea', 'little star', 'cold water',
      'yellow bus', 'good morning', 'sweet mango', 'bright moon', 'tall tree', 'warm socks', 'paper boat',
    ],
    [
      'the cat sat on the mat', 'a bird is singing in the tree', 'please pass me the water', 'we went to the park today',
      'my kite is flying high', 'the rain is falling softly', 'the train goes over the bridge', 'I like to read before bed',
      'the sun rises in the east', 'she has a small green bag', 'let us plant a mango tree', 'the baby is fast asleep',
    ],
    [
      'red lorry yellow lorry', 'she sells sea shells', 'six slim swans swam', 'fresh fried fish', 'toy boat toy boat',
      'unique New York', 'Peter Piper picked a peck of peppers', 'Fred fed Ted bread', 'truly rural', 'blue bluebird',
      'green glass globes glow greenly', 'a big black bug bit a big black bear',
    ],
  ],
  'hi-IN': [
    [
      'तितली', 'इंद्रधनुष', 'हाथी', 'पेंसिल', 'केला', 'छतरी', 'बगीचा', 'कबूतर', 'संतरा', 'खिलौना',
      'मछली', 'बादल', 'गुब्बारा', 'चश्मा', 'दरवाज़ा', 'लालटेन',
    ],
    [
      'नीला आसमान', 'मीठा आम', 'ठंडा पानी', 'छोटा तारा', 'लाल गेंद', 'गरम चाय', 'हरा पत्ता', 'पीली बस',
      'ऊँचा पेड़', 'नरम तकिया', 'प्यारी बिल्ली', 'चमकता चाँद', 'जन्मदिन मुबारक', 'कागज़ की नाव', 'मेरा घर',
    ],
    [
      'बिल्ली छत पर बैठी है', 'पेड़ पर चिड़िया गा रही है', 'मुझे पानी दे दो', 'हम आज पार्क गए',
      'मेरी पतंग ऊँची उड़ रही है', 'धीरे धीरे बारिश हो रही है', 'रेलगाड़ी पुल पर चलती है', 'सूरज पूरब में उगता है',
      'उसके पास हरा बस्ता है', 'चलो आम का पेड़ लगाएँ', 'बच्चा गहरी नींद में है', 'माँ ने खीर बनाई',
    ],
    [
      'कच्चा पापड़ पक्का पापड़', 'पके पेड़ पर पका पपीता', 'लाल पीली लाल पीली', 'समझ समझ के समझ को समझो',
      'चंदू के चाचा ने चंदू की चाची को चाँदी की चम्मच से चटनी चटाई', 'ऊँट ऊँचा ऊँट की पीठ ऊँची',
      'पीतल के पतीले में पपीता पीला पीला', 'मोर मोरनी मोर मोरनी', 'दादा ने दादी को दाल दी', 'नानी ने नाना को नान दिया',
      'कच्चे पक्के पापड़', 'चार चोर चार चाबी',
    ],
  ],
};

export const LEVEL_NAMES = ['Words', 'Short phrases', 'Long phrases', 'Tongue-twisters'];
