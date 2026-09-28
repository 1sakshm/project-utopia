import type { VoiceLang } from '@/sdk';

/** One question: the correct choice is ALWAYS c[0] (choices are shuffled at runtime). */
export interface StoryQ {
  q: string;
  c: [string, string, string];
}
export interface StoryText {
  text: string[];
  qs: [StoryQ, StoryQ];
}
/** Original, gentle micro-stories. `icons[q][i]` illustrates choice i of question q (same in both languages). */
export interface Story {
  level: 1 | 2 | 3;
  icons: [[string, string, string], [string, string, string]];
  en: StoryText;
  hi: StoryText;
}

export const STORIES: Story[] = [
  // ---- level 1: two sentences
  {
    level: 1,
    icons: [['👧', '👦', '👵'], ['🌷', '🏫', '🏞️']],
    en: {
      text: ['Mira found a tiny snail on a leaf.', 'She carried it gently to the garden.'],
      qs: [
        { q: 'Who found the snail?', c: ['Mira', 'Ravi', 'Grandma'] },
        { q: 'Where did she carry it?', c: ['To the garden', 'To school', 'To the river'] },
      ],
    },
    hi: {
      text: ['मीरा को एक पत्ते पर छोटा-सा घोंघा मिला।', 'वह उसे धीरे से बगीचे में ले गई।'],
      qs: [
        { q: 'घोंघा किसे मिला?', c: ['मीरा को', 'रवि को', 'दादी को'] },
        { q: 'वह घोंघे को कहाँ ले गई?', c: ['बगीचे में', 'स्कूल में', 'नदी पर'] },
      ],
    },
  },
  {
    level: 1,
    icons: [['🤸', '😴', '🎵'], ['🌻', '🌹', '🌳']],
    en: {
      text: ['A little cloud wanted to play.', 'It rained softly on the thirsty sunflowers.'],
      qs: [
        { q: 'What did the cloud want to do?', c: ['Play', 'Sleep', 'Sing'] },
        { q: 'What did it rain on?', c: ['Sunflowers', 'Roses', 'Tall trees'] },
      ],
    },
    hi: {
      text: ['एक छोटा बादल खेलना चाहता था।', 'उसने प्यासे सूरजमुखी के फूलों पर धीरे-धीरे पानी बरसाया।'],
      qs: [
        { q: 'बादल क्या करना चाहता था?', c: ['खेलना', 'सोना', 'गाना'] },
        { q: 'उसने किन पर पानी बरसाया?', c: ['सूरजमुखी पर', 'गुलाब पर', 'ऊँचे पेड़ों पर'] },
      ],
    },
  },
  {
    level: 1,
    icons: [['🔴', '🔵', '🟢'], ['🌳', '🌊', '🏫']],
    en: {
      text: ["Arjun's kite was bright red.", 'The wind lifted it high above the park.'],
      qs: [
        { q: 'What colour was the kite?', c: ['Red', 'Blue', 'Green'] },
        { q: 'Where did the kite fly?', c: ['Above the park', 'Over the sea', 'Near the school'] },
      ],
    },
    hi: {
      text: ['अर्जुन की पतंग चमकीली लाल थी।', 'हवा ने उसे पार्क के ऊपर बहुत ऊँचा उड़ा दिया।'],
      qs: [
        { q: 'पतंग किस रंग की थी?', c: ['लाल', 'नीली', 'हरी'] },
        { q: 'पतंग कहाँ उड़ी?', c: ['पार्क के ऊपर', 'समुद्र के ऊपर', 'स्कूल के पास'] },
      ],
    },
  },
  {
    level: 1,
    icons: [['🧺', '🪑', '🛏️'], ['🐱', '🐦', '🐮']],
    en: {
      text: ['A sleepy puppy curled up in a basket.', 'His friend the cat kept him warm.'],
      qs: [
        { q: 'Where did the puppy sleep?', c: ['In a basket', 'On a chair', 'Under a bed'] },
        { q: 'Who kept the puppy warm?', c: ['The cat', 'A bird', 'A cow'] },
      ],
    },
    hi: {
      text: ['एक नींद भरा पिल्ला टोकरी में सिमटकर सो गया।', 'उसकी दोस्त बिल्ली ने उसे गरम रखा।'],
      qs: [
        { q: 'पिल्ला कहाँ सोया?', c: ['टोकरी में', 'कुर्सी पर', 'पलंग के नीचे'] },
        { q: 'पिल्ले को किसने गरम रखा?', c: ['बिल्ली ने', 'चिड़िया ने', 'गाय ने'] },
      ],
    },
  },
  {
    level: 1,
    icons: [['🍪', '🍞', '🎂'], ['🏠', '🧑‍🏫', '🦆']],
    en: {
      text: ['Zoya baked round cookies with her dad.', 'They shared them with the neighbours.'],
      qs: [
        { q: 'What did Zoya bake?', c: ['Cookies', 'Bread', 'A cake'] },
        { q: 'Who did they share them with?', c: ['The neighbours', 'The teacher', 'The ducks'] },
      ],
    },
    hi: {
      text: ['ज़ोया ने अपने पापा के साथ गोल बिस्कुट बनाए।', 'उन्होंने बिस्कुट पड़ोसियों के साथ बाँटे।'],
      qs: [
        { q: 'ज़ोया ने क्या बनाया?', c: ['बिस्कुट', 'रोटी', 'केक'] },
        { q: 'उन्होंने बिस्कुट किसके साथ बाँटे?', c: ['पड़ोसियों के साथ', 'टीचर के साथ', 'बत्तखों के साथ'] },
      ],
    },
  },
  {
    level: 1,
    icons: [['🐢', '🐰', '🐸'], ['🐌', '⚡', '⏪']],
    en: {
      text: ['A turtle walked slowly to the pond.', 'He smiled when he saw the cool water.'],
      qs: [
        { q: 'Who walked to the pond?', c: ['A turtle', 'A rabbit', 'A frog'] },
        { q: 'How did he walk?', c: ['Slowly', 'Quickly', 'Backwards'] },
      ],
    },
    hi: {
      text: ['एक कछुआ धीरे-धीरे तालाब की ओर चला।', 'ठंडा पानी देखकर वह मुस्कुराया।'],
      qs: [
        { q: 'तालाब की ओर कौन चला?', c: ['कछुआ', 'खरगोश', 'मेंढक'] },
        { q: 'वह कैसे चला?', c: ['धीरे-धीरे', 'तेज़ी से', 'उल्टा'] },
      ],
    },
  },
  {
    level: 1,
    icons: [['🥭', '🌹', '🥥'], ['🌅', '🌙', '📅']],
    en: {
      text: ['Kabir planted a mango seed in a pot.', 'Every morning he gave it water.'],
      qs: [
        { q: 'What did Kabir plant?', c: ['A mango seed', 'A rose', 'A coconut'] },
        { q: 'When did he water it?', c: ['Every morning', 'Every night', 'On Sundays'] },
      ],
    },
    hi: {
      text: ['कबीर ने गमले में आम की गुठली बोई।', 'वह हर सुबह उसे पानी देता था।'],
      qs: [
        { q: 'कबीर ने क्या बोया?', c: ['आम की गुठली', 'गुलाब', 'नारियल'] },
        { q: 'वह पानी कब देता था?', c: ['हर सुबह', 'हर रात', 'रविवार को'] },
      ],
    },
  },

  // ---- level 2: three sentences
  {
    level: 2,
    icons: [['⚽', '👒', '👟'], ['🐐', '🐶', '🦆']],
    en: {
      text: ['Priya lost her yellow ball in the tall grass.', 'A friendly goat found it first.', 'It nudged the ball back to her with its nose.'],
      qs: [
        { q: 'What did Priya lose?', c: ['A ball', 'A hat', 'A shoe'] },
        { q: 'Who found it?', c: ['A goat', 'A dog', 'A duck'] },
      ],
    },
    hi: {
      text: ['प्रिया की पीली गेंद ऊँची घास में खो गई।', 'एक प्यारी बकरी ने उसे सबसे पहले ढूँढ लिया।', 'बकरी ने नाक से गेंद प्रिया की ओर धकेल दी।'],
      qs: [
        { q: 'प्रिया की क्या चीज़ खोई?', c: ['गेंद', 'टोपी', 'जूता'] },
        { q: 'गेंद किसने ढूँढी?', c: ['बकरी ने', 'कुत्ते ने', 'बत्तख ने'] },
      ],
    },
  },
  {
    level: 2,
    icons: [['👵', '🧑‍🏫', '👦'], ['🟢', '🔴', '⚪']],
    en: {
      text: ['On a rainy day, Sam and Nani made paper boats.', 'They floated them in a puddle by the door.', "Sam's green boat sailed the farthest."],
      qs: [
        { q: 'Who made boats with Sam?', c: ['Nani', 'His teacher', 'His brother'] },
        { q: "What colour was Sam's boat?", c: ['Green', 'Red', 'White'] },
      ],
    },
    hi: {
      text: ['बारिश के दिन सैम और नानी ने कागज़ की नावें बनाईं।', 'उन्होंने दरवाज़े के पास भरे पानी में नावें तैराईं।', 'सैम की हरी नाव सबसे दूर गई।'],
      qs: [
        { q: 'सैम के साथ नावें किसने बनाईं?', c: ['नानी ने', 'टीचर ने', 'भाई ने'] },
        { q: 'सैम की नाव किस रंग की थी?', c: ['हरी', 'लाल', 'सफ़ेद'] },
      ],
    },
  },
  {
    level: 2,
    icons: [['🦉', '🐻', '🐟'], ['7️⃣', '3️⃣', '🔟']],
    en: {
      text: ['A small owl could not sleep during the day.', 'So she counted the clouds instead.', 'By evening she had counted seven.'],
      qs: [
        { q: 'Who could not sleep?', c: ['An owl', 'A bear', 'A fish'] },
        { q: 'How many clouds did she count?', c: ['Seven', 'Three', 'Ten'] },
      ],
    },
    hi: {
      text: ['एक छोटा उल्लू दिन में सो नहीं पा रहा था।', 'इसलिए वह बादल गिनने लगा।', 'शाम तक उसने सात बादल गिन लिए।'],
      qs: [
        { q: 'कौन सो नहीं पा रहा था?', c: ['उल्लू', 'भालू', 'मछली'] },
        { q: 'उसने कितने बादल गिने?', c: ['सात', 'तीन', 'दस'] },
      ],
    },
  },
  {
    level: 2,
    icons: [['🛒', '🏖️', '🦁'], ['🍌', '💐', '🍎']],
    en: {
      text: ['Leela took her grandpa to the market.', 'They bought bananas first, and then a bunch of flowers.', 'Grandpa carried the flowers all the way home.'],
      qs: [
        { q: 'Where did they go?', c: ['To the market', 'To the beach', 'To the zoo'] },
        { q: 'What did they buy first?', c: ['Bananas', 'Flowers', 'Apples'] },
      ],
    },
    hi: {
      text: ['लीला अपने दादाजी को बाज़ार ले गई।', 'उन्होंने पहले केले खरीदे, फिर फूलों का एक गुच्छा।', 'दादाजी फूल लेकर घर तक आए।'],
      qs: [
        { q: 'वे कहाँ गए?', c: ['बाज़ार', 'समुद्र किनारे', 'चिड़ियाघर'] },
        { q: 'उन्होंने सबसे पहले क्या खरीदा?', c: ['केले', 'फूल', 'सेब'] },
      ],
    },
  },
  {
    level: 2,
    icons: [['🌙', '☀️', '☁️'], ['⭐', '🐦', '✈️']],
    en: {
      text: ['The moon felt lonely in the dark sky.', 'One by one, the stars came out to say hello.', 'Soon the whole sky was twinkling.'],
      qs: [
        { q: 'Who felt lonely?', c: ['The moon', 'The sun', 'A cloud'] },
        { q: 'Who came out to say hello?', c: ['The stars', 'The birds', 'The planes'] },
      ],
    },
    hi: {
      text: ['अँधेरे आसमान में चाँद अकेला महसूस कर रहा था।', 'एक-एक करके तारे उससे मिलने आए।', 'जल्दी ही पूरा आसमान टिमटिमाने लगा।'],
      qs: [
        { q: 'कौन अकेला महसूस कर रहा था?', c: ['चाँद', 'सूरज', 'बादल'] },
        { q: 'चाँद से मिलने कौन आया?', c: ['तारे', 'चिड़ियाँ', 'हवाई जहाज़'] },
      ],
    },
  },
  {
    level: 2,
    icons: [['🌊', '🌷', '🛏️'], ['🏰', '😢', '🏠']],
    en: {
      text: ['Rohan built a sandcastle by the sea.', 'A gentle wave washed away one tower.', 'He laughed and built two more.'],
      qs: [
        { q: 'Where did Rohan build his castle?', c: ['By the sea', 'In the garden', 'In his room'] },
        { q: 'What did Rohan do after the wave?', c: ['Built two more towers', 'Cried', 'Went home'] },
      ],
    },
    hi: {
      text: ['रोहन ने समुद्र किनारे रेत का महल बनाया।', 'एक हल्की लहर एक मीनार बहा ले गई।', 'वह हँसा और उसने दो मीनारें और बना दीं।'],
      qs: [
        { q: 'रोहन ने महल कहाँ बनाया?', c: ['समुद्र किनारे', 'बगीचे में', 'अपने कमरे में'] },
        { q: 'लहर के बाद रोहन ने क्या किया?', c: ['दो मीनारें और बनाईं', 'रोने लगा', 'घर चला गया'] },
      ],
    },
  },
  {
    level: 2,
    icons: [['🌳', '📦', '🏠'], ['🐦', '🐭', '🦊']],
    en: {
      text: ['A squirrel hid acorns under an old oak tree.', 'In winter, she forgot where they were.', 'A robin sang and showed her the spot.'],
      qs: [
        { q: 'Where were the acorns hidden?', c: ['Under a tree', 'In a box', 'On a roof'] },
        { q: 'Who helped the squirrel?', c: ['A robin', 'A mouse', 'A fox'] },
      ],
    },
    hi: {
      text: ['एक गिलहरी ने पुराने बरगद के नीचे मूँगफली छिपाई।', 'सर्दियों में वह भूल गई कि मूँगफली कहाँ छिपाई थी।', 'एक चिड़िया ने गाना गाकर उसे वह जगह दिखाई।'],
      qs: [
        { q: 'मूँगफली कहाँ छिपाई गई थी?', c: ['पेड़ के नीचे', 'डिब्बे में', 'छत पर'] },
        { q: 'गिलहरी की मदद किसने की?', c: ['चिड़िया ने', 'चूहे ने', 'लोमड़ी ने'] },
      ],
    },
  },

  // ---- level 3: four sentences, order and detail questions
  {
    level: 3,
    icons: [['🍊', '🥪', '⚽'], ['📖', '🏊', '🍽️']],
    en: {
      text: [
        'Anya woke up early to see the sunrise.',
        'She packed an orange and a book.',
        'On the hill, she watched the sky turn pink.',
        'Then she read until the birds began to sing.',
      ],
      qs: [
        { q: 'What did Anya pack?', c: ['An orange', 'A sandwich', 'A ball'] },
        { q: 'What did she do after watching the sky?', c: ['Read her book', 'Went swimming', 'Ate lunch'] },
      ],
    },
    hi: {
      text: [
        'अन्या सूरज उगते देखने के लिए जल्दी उठी।',
        'उसने एक संतरा और एक किताब साथ रख ली।',
        'पहाड़ी पर उसने आसमान को गुलाबी होते देखा।',
        'फिर वह चिड़ियों के चहचहाने तक किताब पढ़ती रही।',
      ],
      qs: [
        { q: 'अन्या ने क्या साथ रखा?', c: ['संतरा', 'सैंडविच', 'गेंद'] },
        { q: 'आसमान देखने के बाद उसने क्या किया?', c: ['किताब पढ़ी', 'तैरने गई', 'खाना खाया'] },
      ],
    },
  },
  {
    level: 3,
    icons: [['🦕', '🐳', '🚀'], ['🚌', '⛵', '🚶']],
    en: {
      text: [
        'Dev and his sister Tara went to the library.',
        'Dev chose a book about dinosaurs.',
        'Tara chose one about the ocean.',
        'On the bus home, they swapped books.',
      ],
      qs: [
        { q: "What was Dev's book about?", c: ['Dinosaurs', 'The ocean', 'Space'] },
        { q: 'How did they get home?', c: ['By bus', 'By boat', 'On foot'] },
      ],
    },
    hi: {
      text: [
        'देव और उसकी बहन तारा पुस्तकालय गए।',
        'देव ने डायनासोर वाली किताब चुनी।',
        'तारा ने समुद्र वाली किताब चुनी।',
        'घर लौटते समय बस में उन्होंने किताबें बदल लीं।',
      ],
      qs: [
        { q: 'देव की किताब किस बारे में थी?', c: ['डायनासोर', 'समुद्र', 'अंतरिक्ष'] },
        { q: 'वे घर कैसे लौटे?', c: ['बस से', 'नाव से', 'पैदल'] },
      ],
    },
  },
  {
    level: 3,
    icons: [['🌑', '🌧️', '🌬️'], ['🐜', '🐝', '🐌']],
    en: {
      text: [
        'A little firefly was afraid of the dark.',
        "His grandmother said, 'Your light is your own lantern.'",
        'That night, the firefly glowed brighter than ever.',
        'He led three lost ants safely home.',
      ],
      qs: [
        { q: 'What was the firefly afraid of?', c: ['The dark', 'The rain', 'The wind'] },
        { q: 'Who did he lead home?', c: ['Three ants', 'Two bees', 'A snail'] },
      ],
    },
    hi: {
      text: [
        'एक छोटे जुगनू को अँधेरे से डर लगता था।',
        'उसकी दादी ने कहा, "तुम्हारी रोशनी ही तुम्हारी लालटेन है।"',
        'उस रात जुगनू पहले से भी ज़्यादा चमका।',
        'वह तीन भटकी हुई चींटियों को सही-सलामत घर ले गया।',
      ],
      qs: [
        { q: 'जुगनू को किससे डर लगता था?', c: ['अँधेरे से', 'बारिश से', 'हवा से'] },
        { q: 'जुगनू किसे घर ले गया?', c: ['तीन चींटियों को', 'दो मधुमक्खियों को', 'एक घोंघे को'] },
      ],
    },
  },
  {
    level: 3,
    icons: [['🍅', '🎃', '🥕'], ['🎨', '⛏️', '🌱']],
    en: {
      text: [
        "Maya's class planted a garden at school.",
        'First they dug the soil.',
        'Next they planted tomato seeds.',
        "Last of all, they painted a sign that said, 'Grow, little friends!'",
      ],
      qs: [
        { q: 'What seeds did they plant?', c: ['Tomato', 'Pumpkin', 'Carrot'] },
        { q: 'What did they do last?', c: ['Painted a sign', 'Dug the soil', 'Planted seeds'] },
      ],
    },
    hi: {
      text: [
        'माया की कक्षा ने स्कूल में एक बगीचा लगाया।',
        'पहले उन्होंने मिट्टी खोदी।',
        'फिर उन्होंने टमाटर के बीज बोए।',
        'आख़िर में उन्होंने एक तख्ती रंगी, जिस पर लिखा था, "बढ़ो, नन्हे दोस्तो!"',
      ],
      qs: [
        { q: 'उन्होंने किसके बीज बोए?', c: ['टमाटर', 'कद्दू', 'गाजर'] },
        { q: 'उन्होंने सबसे आख़िर में क्या किया?', c: ['तख्ती रंगी', 'मिट्टी खोदी', 'बीज बोए'] },
      ],
    },
  },
  {
    level: 3,
    icons: [['⚪', '🟡', '🔴'], ['🏞️', '🛒', '🚉']],
    en: {
      text: [
        'Grandpa Ali has a bicycle with a silver bell.',
        'Every Sunday, he rides it to the lake.',
        'He feeds the ducks and waves to the fishermen.',
        'When the bell rings, the ducks know he has come.',
      ],
      qs: [
        { q: 'What colour is the bell?', c: ['Silver', 'Gold', 'Red'] },
        { q: 'Where does Grandpa ride on Sundays?', c: ['To the lake', 'To the market', 'To the station'] },
      ],
    },
    hi: {
      text: [
        'अली दादा के पास चाँदी जैसी घंटी वाली एक साइकिल है।',
        'हर रविवार वे साइकिल से झील तक जाते हैं।',
        'वे बत्तखों को दाना खिलाते हैं और मछुआरों को हाथ हिलाते हैं।',
        'घंटी बजते ही बत्तखें समझ जाती हैं कि दादा आ गए।',
      ],
      qs: [
        { q: 'घंटी किस रंग की है?', c: ['चाँदी जैसी', 'सुनहरी', 'लाल'] },
        { q: 'रविवार को दादा कहाँ जाते हैं?', c: ['झील तक', 'बाज़ार', 'स्टेशन'] },
      ],
    },
  },
  {
    level: 3,
    icons: [['🥛', '🍚', '🧃'], ['📝', '😴', '⚽']],
    en: {
      text: [
        'Nina found a lost kitten on her doorstep.',
        'She gave it milk in a blue bowl.',
        'Then she made a poster with her mother.',
        'The next day, a happy boy came to take his kitten home.',
      ],
      qs: [
        { q: 'What did Nina give the kitten?', c: ['Milk', 'Rice', 'Juice'] },
        { q: 'What did Nina do after feeding it?', c: ['Made a poster', 'Went to sleep', 'Played outside'] },
      ],
    },
    hi: {
      text: [
        'नीना को अपने दरवाज़े पर एक खोया हुआ बिल्ली का बच्चा मिला।',
        'उसने उसे नीली कटोरी में दूध दिया।',
        'फिर उसने अपनी माँ के साथ एक पोस्टर बनाया।',
        'अगले दिन एक खुश लड़का अपने बिल्ली के बच्चे को घर ले गया।',
      ],
      qs: [
        { q: 'नीना ने बिल्ली के बच्चे को क्या दिया?', c: ['दूध', 'चावल', 'जूस'] },
        { q: 'दूध देने के बाद नीना ने क्या किया?', c: ['पोस्टर बनाया', 'सो गई', 'बाहर खेली'] },
      ],
    },
  },
];

export const UI: Record<VoiceLang, { listen: string; question: string; again: string }> = {
  'en-IN': { listen: 'LISTEN TO THE SHELL', question: 'QUESTION', again: '↻ Hear again (½ points)' },
  'hi-IN': { listen: 'सीप की कहानी सुनो', question: 'सवाल', again: '↻ फिर से सुनो (½ अंक)' },
};
