// Word Current content: real words by difficulty tier and pronounceable pseudo-words by plausibility.
// Real tiers go from very common & short (1) to rarer & longer (4).
// Pseudo tiers: 0 = illegal letter strings (easy to reject), 1 = short legal, 2 = mid legal,
// 3 = long word-like, 4 = pseudo-homophones (sound like real words: "brane").
// Every pseudo-word was hand-reviewed; at load time they are also filtered against the real list and an
// offensive-substring blocklist so nothing slips through.

const REAL: Record<1 | 2 | 3 | 4, string> = {
  1: `cat dog sun run big red hat cup bed box fish tree book milk bird cake home door rain snow star moon ship boat
    frog duck ball kite bell lamp hand foot nose king road farm jump sing swim play blue pink gold warm cold soft
    fast slow good kind rich tall bath coat desk leaf lion bear corn salt rice seed nest wolf wind sand rock hill
    lake song time year game city word face baby girl food love help open walk talk read egg map pen bus sky`,
  2: `apple chair house water happy table river light night bread cloud smile paper money horse sheep plant stone
    grass heart music dream beach clean quiet sweet storm tiger zebra piano pencil garden window yellow orange
    purple silver bottle candle bridge castle forest island jacket kitten monkey rabbit school friend summer winter
    spring basket butter circle doctor family finger flower guitar hammer letter market mirror number pocket rocket
    shadow travel wonder planet spider turtle breeze cookie bright green cheese pillow ladder honey`,
  3: `blanket cabinet compass crystal dolphin example feather harvest journey kingdom lantern library machine
    mountain network octopus orchard painter pattern penguin picture pilgrim puzzle quarter railway rainbow science
    shelter soldier station thunder tractor trumpet uniform vessel village volcano weather whisper balance battery
    captain chimney curtain diamond elephant factory glacier harbor highway holiday iceberg kitchen leather meadow
    mineral morning musical blossom cottage bicycle calendar dinosaur envelope hospital keyboard language
    invention`,
  4: `lattice bramble thimble parsnip gazebo trellis sonnet bellows falcon walrus mosaic saffron marigold lagoon
    canopy ember goblet hermit ivory javelin juniper kestrel lullaby mackerel nectar obelisk pendulum quarry rampart
    satchel tapestry tundra vortex wistful zenith almanac barnacle cinnamon dormant emerald fragrant gossamer
    horizon indigo labyrinth meridian nocturnal parchment reservoir sapphire solstice tranquil velvet willow
    whimsical carousel monsoon sycamore tangerine porcelain quicksand driftwood lighthouse filigree marmalade
    meander estuary citadel`,
};

const PSEUDO: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: `xqtl bnfr zkpv gtlm prvk dxnt fgzl kvtr jpms wqlf tnxv hzrk lpqd mvbt snxq qzlb rtkm ndfg vbxl gmwp zxtr
    kjdf plxv bvqn hrtx dmgl fwzk trql npkx cxwv jzrm ptkv gdxl vrqz mzkt bxtq fnwl kqzt wdxr lgvz`,
  1: `zub gop meb fip dov nup keb yot jat vum tiv mip wug bov kiv hib nof gax vop tep wib yim zel
    blim frep glon snup drel plav kleb vosk grob fesp jund lorp nelp mofe dreb flon snet trob plif brol klen grel
    frod drup swib prib smeb trid gluf dwip plon chab shom thep whib snab`,
  2: `frimp blark snorp glift trenk plome drisk spune clobe flurm grask stulp prask crosp skirp dwoll brimb glesk
    sprunt chult glorb twisp flend slomp frelt bleck shrimb thrant spleck flobe grinth clumf stribe prome drelm
    snusk brisp clarn strope gribe frout snoil draif ploast skoon fleep groud trime blafe droft plesk
    lomet pirnel bontle mipsy gorble tunsel rendop poffin lurbet wendop sollop dimpet tobble ferbin nisket garple
    huntle vorry bazzle jomper mofter pelbin runsop zorble bomsey gossle halbin jubbet kellop marfle nubbet pontle
    quibbet rimsel sabbow tolbin vesket yembel zanter snarb florp brenk grolp sklent twindle plisket crobble
    fendrop mulber`,
  3: `snorgle flimber drastle crumbet lorvish trombish glimmet farnish wendlin blundrew brostle quimble plondrick
    stemberal frandolin skorbitty marfitude clendish pondrelite vistamund harbolent dormulate fenderish bristomel
    mundrivel sorbentine tallowin pestrigan rimbletoe glastery brambosh klendrew morbistan plantorium fescalint
    gorbamint hollistrom jumbrelow kestivine marvelope nestigrin orbalint pellistrow quandrify rostimel sandiflur
    tomberish umbrotine vandrelin wistrobel zemblish crandolite fibbertow gandrelish hobbinshaw lorrimund`,
  4: `brane fone kat skool werk rane trane klok frend pleez sope groe snoe bote gole seet stoan tabel apel wawk
    froot boks dorr skie werld burd kitchin munny hunnee wotter sistur peeple laff tawk fayce grene bloo dreem
    cheez skwair smyle ryce tode wyte mayk krab gote bair wosh thum fether cloke`,
};

const BLOCK = ['ass', 'cum', 'fag', 'tit', 'nig', 'cok', 'sex', 'fuk', 'fck', 'shit', 'dik', 'cunt', 'puss', 'wank', 'twat', 'slut', 'jiz', 'nazi', 'kkk', 'rape', 'porn', 'piss', 'crap', 'damn', 'hell', 'poo'];

const split = (s: string) => s.split(/\s+/).map((w) => w.trim().toLowerCase()).filter(Boolean);

export const REAL_WORDS: Record<number, string[]> = {};
const realSet = new Set<string>();
for (const t of [1, 2, 3, 4] as const) {
  REAL_WORDS[t] = [];
  for (const w of split(REAL[t])) {
    if (realSet.has(w)) continue;
    realSet.add(w);
    REAL_WORDS[t].push(w);
  }
}

export const PSEUDO_WORDS: Record<number, string[]> = {};
const pseudoSet = new Set<string>();
for (const t of [0, 1, 2, 3, 4] as const) {
  PSEUDO_WORDS[t] = [];
  for (const w of split(PSEUDO[t])) {
    if (realSet.has(w) || pseudoSet.has(w)) continue;
    if (BLOCK.some((b) => w.includes(b))) continue;
    pseudoSet.add(w);
    PSEUDO_WORDS[t].push(w);
  }
}

export const isReal = (w: string) => realSet.has(w);

export interface Mix {
  real: Array<[number, number]>; // [tier, weight]
  pseudo: Array<[number, number]>;
}

/** Content mix per difficulty level (1..12). */
export function mixFor(level: number): Mix {
  const L = Math.max(1, Math.min(12, level));
  if (L <= 2) return { real: [[1, 1]], pseudo: [[0, 0.65], [1, 0.35]] };
  if (L <= 4) return { real: [[1, 0.6], [2, 0.4]], pseudo: [[0, 0.15], [1, 0.45], [2, 0.4]] };
  if (L <= 6) return { real: [[2, 0.6], [3, 0.4]], pseudo: [[1, 0.2], [2, 0.5], [3, 0.3]] };
  if (L <= 9) return { real: [[2, 0.3], [3, 0.4], [4, 0.3]], pseudo: [[2, 0.35], [3, 0.4], [4, 0.25]] };
  return { real: [[3, 0.45], [4, 0.55]], pseudo: [[3, 0.55], [4, 0.45]] };
}
