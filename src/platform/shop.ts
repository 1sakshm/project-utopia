// Cosmetic + boost catalog. Prices in orbs. Visual definitions are CSS values applied by App.
export type ItemKind = 'skin' | 'theme' | 'pack';

export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  blurb: string;
  price: number; // orbs; 0 = owned by default
  /** Cosmetics can be unlocked once with a rewarded ad ("free sample"). */
  adSample?: boolean;
}

export interface SkinDef extends ShopItem {
  kind: 'skin';
  /** CSS gradient for the orb. */
  gradient: string;
  glow: string;
  /** Highlight → core → rim → shadow colors (drives the 3D orb shader). */
  stops: [string, string, string, string];
}
export interface ThemeDef extends ShopItem {
  kind: 'theme';
  /** Accent + aurora colors (a1..a3). */
  accent: string;
  a1: string;
  a2: string;
  a3: string;
}
export interface PackDef extends ShopItem {
  kind: 'pack';
  boost: 'slowmo' | 'secondWind';
  count: number;
}

const orb = (a: string, b: string, c: string, d: string) => `radial-gradient(circle at 40% 35%, ${a}, ${b} 42%, ${c} 78%, ${d})`;
const skin = (a: string, b: string, c: string, d: string) => ({ gradient: orb(a, b, c, d), stops: [a, b, c, d] as [string, string, string, string] });

export const SKINS: SkinDef[] = [
  { id: 'skin-aurora', kind: 'skin', name: 'Lamp', blurb: 'Warm brass light.', price: 0, ...skin('#fff1d2', '#e3b56a', '#9a6a33', '#2a1a0c'), glow: 'rgba(227,181,106,.45)' },
  { id: 'skin-classic', kind: 'skin', name: 'Aurora', blurb: 'The original glow.', price: 0, ...skin('#fff4d0', '#ff9fb8', '#6c5cff', '#1b1640'), glow: 'rgba(185,156,255,.6)' },
  { id: 'skin-sunrise', kind: 'skin', name: 'Sunrise', blurb: 'Warm peach and gold.', price: 120, adSample: true, ...skin('#fff7da', '#ffc36b', '#ff7a59', '#4a1d2b'), glow: 'rgba(255,170,110,.7)' },
  { id: 'skin-lagoon', kind: 'skin', name: 'Lagoon', blurb: 'Cool teal waters.', price: 120, adSample: true, ...skin('#eafff9', '#6fe3ff', '#1f9aa8', '#0b2a33'), glow: 'rgba(111,227,255,.7)' },
  { id: 'skin-ember', kind: 'skin', name: 'Ember', blurb: 'A soft, glowing coal.', price: 180, ...skin('#fff1c9', '#ff9c5b', '#c2334f', '#2a0b16'), glow: 'rgba(255,120,90,.7)' },
  { id: 'skin-frost', kind: 'skin', name: 'Frost', blurb: 'Pale ice and silver.', price: 180, ...skin('#ffffff', '#cfe8ff', '#7aa8ff', '#16213f'), glow: 'rgba(170,205,255,.75)' },
  { id: 'skin-nebula', kind: 'skin', name: 'Nebula', blurb: 'Deep space violet.', price: 260, ...skin('#f6e8ff', '#c77dff', '#5a189a', '#10002b'), glow: 'rgba(199,125,255,.75)' },
];

export const THEMES: ThemeDef[] = [
  { id: 'theme-aurora', kind: 'theme', name: 'Brass', blurb: 'Aged brass.', price: 0, accent: '#c9a25a', a1: '#8b6cff', a2: '#ff8fb1', a3: '#6fe3ff' },
  { id: 'theme-dusk', kind: 'theme', name: 'Terracotta', blurb: 'Fired clay.', price: 200, adSample: true, accent: '#c98159', a1: '#ff9d5c', a2: '#c77dff', a3: '#ffd36b' },
  { id: 'theme-ocean', kind: 'theme', name: 'Patina', blurb: 'Weathered copper.', price: 200, adSample: true, accent: '#7fa59f', a1: '#3a86ff', a2: '#6fe3ff', a3: '#8dffc4' },
  { id: 'theme-forest', kind: 'theme', name: 'Sage', blurb: 'Pressed leaves.', price: 260, accent: '#9aa77a', a1: '#2d9a6b', a2: '#8dffb0', a3: '#ffe08a' },
  { id: 'theme-mono', kind: 'theme', name: 'Pewter', blurb: 'Quiet grey metal.', price: 260, accent: '#b5afa3', a1: '#8a8aa0', a2: '#c9c9d6', a3: '#5c5c70' },
];

export const PACKS: PackDef[] = [
  { id: 'pack-slowmo', kind: 'pack', name: 'Slow-mo ×3', blurb: 'Every timer gets 50% more time for one run.', price: 100, boost: 'slowmo', count: 3 },
  { id: 'pack-wind', kind: 'pack', name: 'Second Wind ×3', blurb: 'A free second chance when a run ends.', price: 150, boost: 'secondWind', count: 3 },
];

export const ITEM_BY_ID: Record<string, ShopItem> = Object.fromEntries([...SKINS, ...THEMES, ...PACKS].map((i) => [i.id, i]));
export const DEFAULT_OWNED = ['skin-aurora', 'skin-classic', 'theme-aurora'];

/** Boost prices when bought directly from the pre-game picker. */
export const BOOST_ORB_PRICE = { slowmo: 40, secondWind: 60 } as const;
