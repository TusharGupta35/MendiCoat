import type { DhamakaId } from './types';

/**
 * Every Dhamaka the game can throw at a round.
 *
 * Kept as data so the rest of the game asks questions of it ("is there a No
 * Eraser this round?") instead of switching on names. Adding a Dhamaka is an
 * entry here plus whatever it changes — the picker, the announcement and the
 * scoring bonus all read this list.
 */

export type DhamakaKind = 'draw' | 'guess' | 'time' | 'canvas';

export interface Dhamaka {
  id: DhamakaId;
  name: string;
  emoji: string;
  kind: DhamakaKind;
  /** What the table is told, in one line. */
  rule: string;
  /**
   * Dhamakas that fight over the same thing share a slot, and a round never
   * gets two from one slot: Tiny Pen and Giant Pen cannot both be true, and No
   * Chat with Chaos Chat is just No Chat.
   */
  slot: string;
  /** How often it comes up, relative to the others. */
  weight: number;
  /**
   * Extra points for surviving it, as a fraction on top of normal scoring.
   * Applies to the drawer and the guessers alike: a Blind Artist round is hard
   * on everybody.
   */
  bonus: number;
  /** Nothing checks it — it is on the drawer's honour. */
  honour?: boolean;
}

export const DHAMAKAS: Dhamaka[] = [
  // ── Draw ────────────────────────────────────────────────────────────────
  { id: 'one-stroke', name: 'One Stroke', emoji: '✍️', kind: 'draw', slot: 'erase', weight: 2, bonus: 0.3,
    rule: 'One continuous line. Lift the pen and your drawing is done.' },
  { id: 'tiny-pen', name: 'Tiny Pen', emoji: '🪡', kind: 'draw', slot: 'pen-size', weight: 3, bonus: 0.1,
    rule: 'The thinnest brush there is.' },
  { id: 'giant-pen', name: 'Giant Pen', emoji: '🖌️', kind: 'draw', slot: 'pen-size', weight: 3, bonus: 0.1,
    rule: 'One enormous brush. Good luck with the details.' },
  { id: 'one-color', name: 'One Color', emoji: '🎯', kind: 'draw', slot: 'pen-color', weight: 3, bonus: 0.05,
    rule: 'A single colour, picked for you.' },
  { id: 'color-roulette', name: 'Color Roulette', emoji: '🎰', kind: 'draw', slot: 'pen-color', weight: 2, bonus: 0.1,
    rule: 'Your colour changes by itself every few seconds.' },
  { id: 'no-eraser', name: 'No Eraser', emoji: '🚫', kind: 'draw', slot: 'erase', weight: 3, bonus: 0.1,
    rule: 'No eraser, no undo, no clear. Every line stays.' },
  { id: 'blind-artist', name: 'Blind Artist', emoji: '🙈', kind: 'draw', slot: 'self-view', weight: 1, bonus: 0.4,
    rule: 'The drawer cannot see their own drawing. Everyone else can.' },
  { id: 'mirror-artist', name: 'Mirror Artist', emoji: '🪞', kind: 'draw', slot: 'self-view', weight: 1, bonus: 0.3,
    rule: "The drawer's canvas is mirrored — left is right." },
  { id: 'opposite-hand', name: 'Opposite Hand', emoji: '🤚', kind: 'draw', slot: 'hand', weight: 2, bonus: 0.2, honour: true,
    rule: 'Draw with your other hand. We are trusting you.' },

  // ── Guess ───────────────────────────────────────────────────────────────
  { id: 'no-chat', name: 'No Chat', emoji: '🤐', kind: 'guess', slot: 'chat', weight: 2, bonus: 0.1,
    rule: "Nobody sees anyone else's guesses. Think for yourself." },
  { id: 'chaos-chat', name: 'Chaos Chat', emoji: '👻', kind: 'guess', slot: 'chat', weight: 2, bonus: 0.1,
    rule: 'Fake guesses keep appearing in the feed. Trust nobody.' },
  { id: 'one-guess', name: 'One Guess Only', emoji: '☝️', kind: 'guess', slot: 'guess-limit', weight: 2, bonus: 0.3,
    rule: 'Everyone gets exactly one guess. Make it count.' },
  { id: 'hot-or-cold', name: 'Hot or Cold', emoji: '🌡️', kind: 'guess', slot: 'feedback', weight: 2, bonus: 0,
    rule: 'Every wrong guess tells you if you are getting warmer.' },

  // ── Time ────────────────────────────────────────────────────────────────
  { id: 'panic', name: '30-Second Panic', emoji: '⏱️', kind: 'time', slot: 'time', weight: 2, bonus: 0.5,
    rule: 'The whole round lasts thirty seconds. Points are worth more.' },
  { id: 'bonus-time', name: 'Bonus Time', emoji: '⏳', kind: 'time', slot: 'time', weight: 2, bonus: 0,
    rule: 'Every correct guess adds five seconds to the clock.' },
  { id: 'sudden-death', name: 'Sudden Death', emoji: '⚠️', kind: 'time', slot: 'time', weight: 2, bonus: 0.1,
    rule: 'Late in the round the hints stop for good. Final chance.' },

  // ── Canvas ─ used sparingly, so the drawing stays readable ───────────────
  { id: 'vanishing-lines', name: 'Vanishing Lines', emoji: '💨', kind: 'canvas', slot: 'canvas', weight: 1, bonus: 0.2,
    rule: 'Old lines fade away as new ones are drawn.' },
  { id: 'flip', name: 'Flip', emoji: '🔄', kind: 'canvas', slot: 'canvas', weight: 1, bonus: 0.1,
    rule: 'Halfway through, the drawing flips for everyone guessing.' },
  { id: 'fog', name: 'Fog', emoji: '🌫️', kind: 'canvas', slot: 'canvas', weight: 1, bonus: 0.2,
    rule: 'Drifting fog hides parts of the canvas from the guessers.' },
];

export const dhamakaById = (id: DhamakaId) => DHAMAKAS.find((entry) => entry.id === id)!;

export const hasDhamaka = (list: DhamakaId[], id: DhamakaId) => list.includes(id);

/**
 * Named combinations. When a round's Dhamakas happen to include one of these,
 * it gets announced by name — a Double Dhamaka of Blind Artist and One Stroke
 * deserves to be called what it is.
 */
export const COMBOS: Array<{ name: string; emoji: string; ids: DhamakaId[] }> = [
  { name: 'Ultimate Dhamaka', emoji: '☢️', ids: ['one-stroke', 'tiny-pen', 'panic'] },
  { name: 'Impossible Artist', emoji: '😵', ids: ['blind-artist', 'one-stroke'] },
  { name: 'Panic Artist', emoji: '😱', ids: ['panic', 'giant-pen'] },
  { name: 'Chaos Artist', emoji: '🌀', ids: ['color-roulette', 'fog'] },
];

export function comboFor(ids: DhamakaId[]): string | undefined {
  return COMBOS.find((combo) => combo.ids.every((id) => ids.includes(id)))?.name;
}

/**
 * How many Dhamakas each round gets.
 *
 * One per round, a Double every fourth round, and a Grand — three at once — to
 * finish. Decided before the game starts so the table can be warned: the
 * anticipation is half of it.
 */
export function planDhamakas(totalRounds: number): number[] {
  return Array.from({ length: totalRounds }, (_, index) => {
    if (index === totalRounds - 1 && totalRounds >= 3) return 3;
    if ((index + 1) % 4 === 0) return 2;
    return 1;
  });
}

/**
 * Draws `count` Dhamakas at random by weight, never two from the same slot.
 */
export function pickDhamakas(count: number, rng: () => number = Math.random): DhamakaId[] {
  const picked: DhamakaId[] = [];
  const takenSlots = new Set<string>();
  // A round gets at most one canvas effect however many Dhamakas it has: two
  // at once and nobody can see the drawing at all.
  for (let draw = 0; draw < count; draw += 1) {
    const pool = DHAMAKAS.filter((entry) => !takenSlots.has(entry.slot) && !picked.includes(entry.id));
    if (pool.length === 0) break;
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * total;
    const chosen = pool.find((entry) => (roll -= entry.weight) < 0) ?? pool[pool.length - 1];
    picked.push(chosen.id);
    takenSlots.add(chosen.slot);
  }
  return picked;
}

/** The scoring bonus for surviving this round's Dhamakas, as a multiplier. */
export function dhamakaMultiplier(ids: DhamakaId[]): number {
  return 1 + ids.reduce((sum, id) => sum + dhamakaById(id).bonus, 0);
}

export const PALETTE = [
  '#1f1b2e', // ink
  '#6b7280', // grey
  '#dc2626', // red
  '#f97316', // orange
  '#facc15', // yellow
  '#16a34a', // green
  '#0ea5e9', // sky
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#92400e', // brown
  '#ffffff', // white
];

/** Brush widths in thousandths of the canvas width. */
export const BRUSH_SIZES = [4, 9, 18, 34];
export const TINY_BRUSH = 2;
export const GIANT_BRUSH = 60;

/** The brushes allowed this round. */
export function brushesFor(ids: DhamakaId[]): number[] {
  if (ids.includes('tiny-pen')) return [TINY_BRUSH];
  if (ids.includes('giant-pen')) return [GIANT_BRUSH];
  return BRUSH_SIZES;
}

/** How long each colour lasts under Color Roulette. */
export const ROULETTE_MS = 6000;
