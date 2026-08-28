/**
 * The cast of players you can pick from.
 *
 * Every avatar is drawn from the same handful of shapes rather than stored as
 * an image: nothing to upload, nothing to host, nothing to cache, and the whole
 * set stays on-theme because it shares one palette. Adding a character means
 * adding a row here.
 */

export type HairStyle = 'short' | 'buzz' | 'bun' | 'long' | 'wavy' | 'braid' | 'turban' | 'cap';
export type Accessory = 'none' | 'glasses' | 'shades' | 'earrings' | 'moustache' | 'bindi' | 'crown' | 'beard';

export interface Avatar {
  id: string;
  label: string;
  /** Grouping for the picker, so there is a set of each to choose between. */
  cast: 'a' | 'b';
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  accessory: Accessory;
  outfit: string;
  from: string;
  to: string;
}

const SKIN = {
  light: '#f0cba6',
  tan: '#dda876',
  warm: '#c1834f',
  deep: '#96603a',
  dark: '#6f4326',
} as const;

export const AVATARS: Avatar[] = [
  // ── One set ───────────────────────────────────────────────────────────────
  { id: 'duchess', label: 'The Duchess', cast: 'a', skin: SKIN.light, hair: '#3b2415', hairStyle: 'bun', accessory: 'earrings', outfit: '#7f1d45', from: '#4a1d3f', to: '#1d0f22' },
  { id: 'sharp', label: 'The Sharp', cast: 'a', skin: SKIN.tan, hair: '#1f1410', hairStyle: 'long', accessory: 'shades', outfit: '#1f3a5f', from: '#2b5c8f', to: '#101f33' },
  { id: 'rani', label: 'Rani', cast: 'a', skin: SKIN.warm, hair: '#241612', hairStyle: 'braid', accessory: 'bindi', outfit: '#166534', from: '#1c7a44', to: '#0c2e1b' },
  { id: 'ace-high', label: 'Ace High', cast: 'a', skin: SKIN.deep, hair: '#2b1b12', hairStyle: 'wavy', accessory: 'crown', outfit: '#a16207', from: '#78350f', to: '#2a1608' },
  { id: 'violet', label: 'Violet', cast: 'a', skin: SKIN.light, hair: '#7c3aed', hairStyle: 'short', accessory: 'glasses', outfit: '#4c1d95', from: '#4c1d95', to: '#1e1035' },
  { id: 'the-dealer', label: 'The Dealer', cast: 'a', skin: SKIN.dark, hair: '#171717', hairStyle: 'bun', accessory: 'none', outfit: '#0f766e', from: '#1a7f86', to: '#0a3034' },

  // ── The other ─────────────────────────────────────────────────────────────
  { id: 'rookie', label: 'The Rookie', cast: 'b', skin: SKIN.light, hair: '#8b5a2b', hairStyle: 'short', accessory: 'none', outfit: '#1d4ed8', from: '#1e3a8a', to: '#0d1730' },
  { id: 'hustler', label: 'The Hustler', cast: 'b', skin: SKIN.tan, hair: '#1f1410', hairStyle: 'cap', accessory: 'shades', outfit: '#7f1d1d', from: '#7f1d33', to: '#2b0f18' },
  { id: 'raja', label: 'Raja', cast: 'b', skin: SKIN.warm, hair: '#1a1008', hairStyle: 'turban', accessory: 'beard', outfit: '#b45309', from: '#78350f', to: '#2a1608' },
  { id: 'shark', label: 'Card Shark', cast: 'b', skin: SKIN.deep, hair: '#141414', hairStyle: 'buzz', accessory: 'moustache', outfit: '#3f3f46', from: '#4b4b55', to: '#17171b' },
  { id: 'lucky', label: 'Lucky', cast: 'b', skin: SKIN.dark, hair: '#0f0f0f', hairStyle: 'short', accessory: 'glasses', outfit: '#15803d', from: '#1c7a44', to: '#0c2e1b' },
  { id: 'the-boss', label: 'The Boss', cast: 'b', skin: SKIN.light, hair: '#6b7280', hairStyle: 'wavy', accessory: 'crown', outfit: '#4338ca', from: '#3b2566', to: '#1c1030' },
];

export const avatarById = (id: string | null | undefined) =>
  AVATARS.find((avatar) => avatar.id === id) ?? null;

export const isAvatarId = (id: unknown): id is string =>
  typeof id === 'string' && AVATARS.some((avatar) => avatar.id === id);

/** Two letters at most, so a fallback disc never overflows. */
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A player with no pick still gets a face: one is chosen from their id, so it
 * stays the same every time rather than shuffling between page loads.
 */
export function avatarFor(id: string | null | undefined, userKey: string): Avatar {
  const chosen = avatarById(id);
  if (chosen) return chosen;
  let hash = 0;
  for (let i = 0; i < userKey.length; i += 1) hash = (hash * 31 + userKey.charCodeAt(i)) >>> 0;
  return AVATARS[hash % AVATARS.length];
}
