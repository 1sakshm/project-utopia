import type { VoiceLang } from '@/sdk';

/**
 * Categories for verbal fluency. Each item is one concept: "english variants / hindi variants" (variants split by "|").
 * Hindi variants include Devanagari spellings and common Roman (Hinglish) spellings, so both spoken transcripts and
 * typed answers match. A concept counts once, whichever language or variant was said.
 */
export interface Category {
  id: string;
  name: Record<VoiceLang, string>;
  /** What the voice says to start the round. */
  prompt: Record<VoiceLang, string>;
  items: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'animals',
    name: { 'en-IN': 'Animals', 'hi-IN': 'जानवर' },
    prompt: { 'en-IN': 'Name animals!', 'hi-IN': 'जानवरों के नाम बताओ!' },
    items: [
      'dog|puppy / कुत्ता|पिल्ला|kutta|pilla', 'cat|kitten / बिल्ली|billi', 'cow|calf / गाय|बछड़ा|gaay|gai', 'buffalo / भैंस|bhains',
      'horse|pony / घोड़ा|ghoda|ghora', 'donkey / गधा|gadha', 'goat / बकरी|bakri', 'sheep|lamb / भेड़|bhed', 'pig / सूअर|suar',
      'elephant / हाथी|haathi|hathi', 'lion / बब्बर शेर|सिंह|शेर|sher|singh', 'tiger / बाघ|baagh|bagh', 'leopard / तेंदुआ|tendua',
      'cheetah / चीता|cheeta', 'bear / भालू|bhalu|bhaalu', 'monkey / बंदर|bandar', 'deer / हिरण|हिरन|hiran',
      'rabbit|bunny / खरगोश|khargosh', 'mouse|rat / चूहा|chuha', 'squirrel / गिलहरी|gilahri|gilehri', 'camel / ऊँट|ऊंट|oont|unt',
      'giraffe / जिराफ़|जिराफ', 'zebra / ज़ेबरा|जेबरा', 'fox / लोमड़ी|lomdi', 'wolf / भेड़िया|bhediya', 'snake / साँप|सांप|saanp|saap',
      'frog / मेंढक|mendhak', 'turtle|tortoise / कछुआ|kachhua', 'fish / मछली|machhli|machli', 'crocodile|alligator / मगरमच्छ|magarmachh',
      'kangaroo / कंगारू', 'panda / पांडा|पंडा', 'hippo|hippopotamus / दरियाई घोड़ा', 'rhino|rhinoceros / गैंडा|gainda',
      'bird / चिड़िया|पक्षी|chidiya|pakshi', 'parrot / तोता|tota', 'peacock / मोर|mor', 'crow / कौआ|kauwa|kauva', 'duck / बत्तख|battakh',
      'hen|chicken|rooster / मुर्गी|मुर्गा|murgi|murga', 'owl / उल्लू|ullu', 'pigeon / कबूतर|kabootar|kabutar', 'eagle|hawk / बाज़|चील|baaz|cheel',
      'ant / चींटी|cheenti|chiti', 'bee / मधुमक्खी|madhumakkhi', 'butterfly / तितली|titli', 'spider / मकड़ी|makdi', 'whale / व्हेल',
      'dolphin / डॉल्फ़िन|डॉल्फिन', 'shark / शार्क', 'penguin / पेंगुइन', 'lizard / छिपकली|chhipkali|chipkali', 'bat / चमगादड़|chamgadad',
      'swan|goose / हंस|hans', 'octopus / ऑक्टोपस', 'yak / याक', 'koala / कोआला', 'gorilla / गोरिल्ला', 'chimpanzee|chimp / चिंपैंजी',
      'otter / ऊदबिलाव', 'hedgehog / साही|सेही', 'crab / केकड़ा|kekda', 'snail / घोंघा|ghongha', 'mosquito / मच्छर|machhar|machchhar',
    ],
  },
  {
    id: 'fruits',
    name: { 'en-IN': 'Fruits', 'hi-IN': 'फल' },
    prompt: { 'en-IN': 'Name fruits!', 'hi-IN': 'फलों के नाम बताओ!' },
    items: [
      'apple / सेब|seb', 'banana / केला|kela', 'mango / आम|aam', 'orange / संतरा|नारंगी|santra|narangi', 'grapes|grape / अंगूर|angoor|angur',
      'watermelon / तरबूज़|तरबूज|tarbooz|tarbuj', 'muskmelon|melon|cantaloupe / खरबूज़ा|खरबूजा|kharbooja|kharbuja', 'papaya / पपीता|papita',
      'pineapple / अनानास|ananas', 'guava / अमरूद|amrood|amrud', 'pomegranate / अनार|anaar|anar', 'lemon|lime / नींबू|nimbu|neembu',
      'coconut / नारियल|nariyal', 'strawberry / स्ट्रॉबेरी|स्ट्रोबेरी', 'cherry / चेरी', 'pear / नाशपाती|nashpati', 'peach / आड़ू|aadu',
      'plum / आलूबुखारा|aloo bukhara', 'apricot / खुबानी|khubani', 'kiwi / कीवी', 'lychee|litchi / लीची|lichi',
      'jackfruit / कटहल|kathal', 'custard apple / शरीफ़ा|शरीफा|सीताफल|sharifa|sitaphal', 'chikoo|chiku|sapota / चीकू|chikoo',
      'fig / अंजीर|anjeer|anjir', 'dates|date / खजूर|khajur', 'jamun|java plum / जामुन|jamun', 'blueberry / ब्लूबेरी', 'avocado / एवोकाडो',
      'dragon fruit / ड्रैगन फ्रूट', 'gooseberry|amla / आंवला|आँवला|amla', 'sweet lime|mosambi / मौसंबी|मौसमी|mosambi',
      'tamarind / इमली|imli', 'blackberry / ब्लैकबेरी', 'raspberry / रसभरी|रास्पबेरी', 'wood apple|bael / बेल|bel',
      'jujube|ber / बेर|ber', 'tangerine|mandarin / कीनू|kinnow|kinu', 'mulberry / शहतूत|shahtoot', 'grapefruit / चकोतरा|chakotra',
      'passion fruit / पैशन फ्रूट', 'cranberry / क्रैनबेरी', 'star fruit / कमरख|kamrakh', 'olive / जैतून|jaitun',
    ],
  },
  {
    id: 'kitchen',
    name: { 'en-IN': 'Things in a kitchen', 'hi-IN': 'रसोई की चीज़ें' },
    prompt: { 'en-IN': 'Name things in a kitchen!', 'hi-IN': 'रसोई की चीज़ों के नाम बताओ!' },
    items: [
      'spoon / चम्मच|chammach|chamach', 'fork / काँटा|कांटा|kaanta', 'knife / चाकू|chaku|chaaku', 'plate / थाली|प्लेट|thali|plate',
      'bowl / कटोरी|कटोरा|katori|katora', 'glass|tumbler / गिलास|gilas|glass', 'cup|mug / कप|प्याला|pyala', 'pan|frying pan|wok / कढ़ाई|कड़ाही|kadhai|kadai',
      'pressure cooker|cooker / कुकर|cooker', 'pot|vessel / पतीला|भगोना|patila|bhagona|bartan|बर्तन', 'tawa|griddle / तवा|tawa|tava',
      'rolling pin / बेलन|belan', 'stove|gas|burner / चूल्हा|गैस|chulha', 'fridge|refrigerator / फ्रिज|फ़्रिज|fridge', 'oven|microwave / ओवन|माइक्रोवेव',
      'mixer|blender|grinder|mixie / मिक्सर|mixer', 'kettle / केतली|ketli', 'toaster / टोस्टर', 'sink / सिंक', 'tap|faucet / नल|nal',
      'bottle / बोतल|botal', 'jar|box|container / डिब्बा|मर्तबान|dibba', 'salt / नमक|namak', 'sugar / चीनी|शक्कर|cheeni|chini|shakkar',
      'spices|masala / मसाला|masala', 'rice / चावल|chawal', 'flour|atta / आटा|aata|atta', 'oil / तेल|tel', 'tray / ट्रे',
      'ladle / करछी|कलछी|karchhi|kalchhi', 'spatula / पलटा|palta', 'tongs / चिमटा|chimta', 'strainer|sieve|colander / छलनी|chhalni|chalni',
      'grater / कद्दूकस|kaddukas', 'chopping board|cutting board / चॉपिंग बोर्ड', 'apron / एप्रन', 'matchbox|matches|lighter / माचिस|machis',
      'dustbin|bin / कूड़ेदान|kudedan', 'table / मेज़|मेज|टेबल|mez', 'chair / कुर्सी|kursi', 'lunchbox|tiffin / टिफ़िन|टिफिन|tiffin',
      'water filter|filter / फ़िल्टर|फिल्टर', 'mortar|pestle / खरल|ओखली|सिलबट्टा|okhli', 'bucket / बाल्टी|balti', 'tea / चाय|chai|chay',
      'milk / दूध|doodh|dudh', 'bread / ब्रेड', 'roti|chapati / रोटी|चपाती|roti', 'lid / ढक्कन|dhakkan', 'flask|thermos / थर्मस',
      'napkin|towel / तौलिया|नैपकिन|tauliya', 'sponge|scrubber / स्पंज|स्क्रबर', 'dish|dishes / बर्तन', 'egg|eggs / अंडा|anda',
      'butter / मक्खन|makkhan', 'jam / जैम', 'honey / शहद|shahad', 'vegetables / सब्ज़ी|सब्जी|sabzi|sabji', 'fruit|fruits / फल|phal',
    ],
  },
  {
    id: 'fly',
    name: { 'en-IN': 'Things that fly', 'hi-IN': 'उड़ने वाली चीज़ें' },
    prompt: { 'en-IN': 'Name things that fly!', 'hi-IN': 'उड़ने वाली चीज़ों के नाम बताओ!' },
    items: [
      'bird / चिड़िया|पक्षी|परिंदा|chidiya|pakshi|parinda', 'aeroplane|airplane|plane|aircraft|jet / हवाई जहाज़|हवाई जहाज|जहाज़|जहाज|jahaz|jahaj',
      'helicopter / हेलीकॉप्टर|हेलिकॉप्टर', 'kite / पतंग|patang', 'butterfly / तितली|titli', 'bee|honeybee / मधुमक्खी|madhumakkhi',
      'fly|housefly / मक्खी|makkhi', 'mosquito / मच्छर|machhar|machchhar', 'balloon|hot air balloon / गुब्बारा|gubbara',
      'rocket / रॉकेट|राकेट', 'drone / ड्रोन', 'parrot / तोता|tota', 'crow / कौआ|kauwa|kauva', 'eagle|hawk|falcon / बाज़|चील|baaz|cheel',
      'owl / उल्लू|ullu', 'pigeon|dove / कबूतर|kabootar|kabutar', 'bat / चमगादड़|chamgadad', 'dragonfly / ड्रैगनफ़्लाई|ड्रैगनफ्लाई',
      'sparrow / गौरैया|gauraiya', 'duck / बत्तख|battakh', 'peacock / मोर|mor', 'swan|goose / हंस|hans', 'seagull|gull / समुद्री पक्षी',
      'paper plane|paper aeroplane / कागज़ का जहाज़|कागज का जहाज', 'parachute|paraglider|glider / पैराशूट', 'spaceship|spacecraft|ufo / अंतरिक्ष यान|यान',
      'satellite / उपग्रह|सैटेलाइट', 'cloud|clouds / बादल|badal', 'feather / पंख|pankh', 'bubble|bubbles / बुलबुला|bulbula',
      'fairy|angel / परी|pari', 'dragon / ड्रैगन', 'beetle|ladybug|ladybird / भौंरा|bhaunra|bhanwra', 'moth / पतंगा|patanga',
      'firefly / जुगनू|jugnu', 'hummingbird / हमिंगबर्ड', 'crane|stork / सारस|saras', 'vulture / गिद्ध|giddh', 'flamingo / फ्लेमिंगो',
      'frisbee / फ्रिस्बी', 'kingfisher / किंगफ़िशर|किलकिला', 'cuckoo|koel / कोयल|koyal', 'myna|mynah / मैना|maina', 'leaf|leaves / पत्ता|पत्ते|patta',
      'airship|blimp|zeppelin / हवाई पोत', 'jet pack|jetpack / जेटपैक', 'wasp|hornet / ततैया|tataiya|बर्र', 'dandelion seed|seeds / बीज',
    ],
  },
  {
    id: 'vegetables',
    name: { 'en-IN': 'Vegetables', 'hi-IN': 'सब्ज़ियाँ' },
    prompt: { 'en-IN': 'Name vegetables!', 'hi-IN': 'सब्ज़ियों के नाम बताओ!' },
    items: [
      'potato / आलू|aloo|aalu|alu', 'tomato / टमाटर|tamatar', 'onion / प्याज़|प्याज|pyaaz|pyaz', 'carrot / गाजर|gajar',
      'cabbage / पत्ता गोभी|पत्तागोभी|बंद गोभी|patta gobhi|band gobhi', 'cauliflower / फूलगोभी|फूल गोभी|गोभी|gobhi|gobi',
      'peas|pea / मटर|matar', 'spinach / पालक|palak', 'brinjal|eggplant|aubergine / बैंगन|baingan', 'okra|ladyfinger|lady finger|bhindi / भिंडी|bhindi',
      'cucumber / खीरा|ककड़ी|kheera|khira|kakdi', 'pumpkin / कद्दू|kaddu', 'bottle gourd|lauki / लौकी|घीया|lauki|ghiya',
      'bitter gourd|karela / करेला|karela', 'radish / मूली|mooli|muli', 'beetroot|beet / चुकंदर|chukandar', 'garlic / लहसुन|lahsun|lehsun',
      'ginger / अदरक|adrak', 'chilli|chili|green chilli / मिर्च|हरी मिर्च|mirch', 'capsicum|bell pepper / शिमला मिर्च|shimla mirch',
      'corn|maize|sweet corn / मक्का|भुट्टा|makka|bhutta', 'beans|green beans / बीन्स|फली|सेम|sem', 'mushroom / मशरूम|खुम्बी|khumbi',
      'lettuce / सलाद पत्ता|लेट्यूस', 'sweet potato / शकरकंद|shakarkand', 'turnip / शलजम|shaljam', 'coriander|cilantro / धनिया|dhaniya|dhania',
      'mint / पुदीना|pudina', 'fenugreek|methi / मेथी|methi', 'broccoli / ब्रोकली|ब्रोकोली', 'zucchini / ज़ुकिनी|तोरी', 'celery / सेलेरी|अजवाइन पत्ता',
      'spring onion / हरा प्याज़|हरा प्याज', 'drumstick|moringa / सहजन|सहजन की फली|sahjan', 'ridge gourd|turai / तोरई|turai|tori',
      'jackfruit / कटहल|kathal', 'yam / जिमीकंद|सूरन|suran', 'taro|colocasia|arbi / अरबी|arbi', 'round gourd|tinda / टिंडा|tinda',
      'cluster beans|gawar / ग्वार|gawar|guar', 'lemon|lime / नींबू|nimbu', 'raw banana|plantain / कच्चा केला', 'leek / लीक',
      'kale / केल', 'asparagus / शतावरी', 'artichoke / आर्टिचोक', 'bathua / बथुआ|bathua', 'mustard greens|sarson / सरसों|sarson',
    ],
  },
  {
    id: 'clothes',
    name: { 'en-IN': 'Clothes', 'hi-IN': 'कपड़े' },
    prompt: { 'en-IN': 'Name clothes you can wear!', 'hi-IN': 'पहनने वाले कपड़ों के नाम बताओ!' },
    items: [
      'shirt / कमीज़|कमीज|शर्ट|kameez|kamiz', 't-shirt|tshirt|t shirt / टी-शर्ट|टीशर्ट|टी शर्ट', 'trousers|pants / पैंट|पतलून|patloon|pant',
      'jeans / जींस', 'shorts|half pant / निक्कर|शॉर्ट्स|nikkar', 'skirt / स्कर्ट|घाघरा|ghaghra', 'frock|dress|gown / फ़्रॉक|फ्रॉक|ड्रेस',
      'saree|sari / साड़ी|saadi|sari', 'kurta / कुर्ता|kurta', 'kurti / कुर्ती|kurti', 'pyjama|pajama|pajamas|pyjamas / पजामा|पायजामा|pajama',
      'salwar / सलवार|salwar', 'dupatta|scarf|stole / दुपट्टा|स्कार्फ़|dupatta', 'lehenga / लहंगा|lehenga', 'dhoti / धोती|dhoti',
      'sweater|jumper|pullover / स्वेटर|sweater', 'jacket|coat / जैकेट|कोट', 'raincoat / रेनकोट|बरसाती|barsati', 'cap|hat / टोपी|topi',
      'turban|pagdi / पगड़ी|pagdi|pagri', 'socks / मोज़े|मोजे|जुराब|moze|juraab', 'shoes|shoe|sneakers / जूते|जूता|joote|joota|jute',
      'sandals|chappal|slippers|flip flops / चप्पल|सैंडल|chappal', 'gloves / दस्ताने|dastane', 'shawl|muffler / शॉल|शाल|मफ़लर|मफलर',
      'vest|banyan|undershirt / बनियान|baniyan', 'uniform / वर्दी|यूनिफ़ॉर्म|यूनिफॉर्म|vardi', 'belt / बेल्ट|पेटी', 'tie|necktie / टाई',
      'blouse / ब्लाउज़|ब्लाउज', 'suit / सूट', 'sherwani / शेरवानी|sherwani', 'nightdress|nightgown|nightie / नाइटी|नाइट ड्रेस',
      'tracksuit / ट्रैकसूट', 'hoodie / हुडी', 'swimsuit|swimming costume / स्विमसूट', 'blazer / ब्लेज़र|ब्लेजर', 'boots / बूट',
      'lungi / लुंगी|lungi', 'handkerchief|hanky / रूमाल|rumal|roomal', 'mittens / मिटन', 'cardigan / कार्डिगन', 'overcoat / ओवरकोट',
      'kurta pyjama / कुर्ता पजामा', 'waistcoat / सदरी|वास्कट|sadri', 'bib / बिब', 'crown / मुकुट|mukut', 'bangles / चूड़ियाँ|चूड़ी|choodi|chudi',
    ],
  },
];

/** Filler words that are neither right nor wrong (not shown as rejected). */
export const FILLER = new Set([
  'and', 'a', 'an', 'the', 'um', 'uh', 'umm', 'hmm', 'er', 'erm', 'oh', 'ok', 'okay', 'also', 'then', 'more', 'some', 'like',
  'so', 'yes', 'no', 'is', 'are', 'of', 'my', 'aur', 'bhi', 'phir', 'ek', 'hai', 'hain', 'to', 'ki', 'ka', 'ke', 'or',
  'और', 'भी', 'फिर', 'एक', 'है', 'हैं', 'तो', 'की', 'का', 'के', 'या', 'अं', 'हम्म',
]);
