import type { ChaalId, Mode } from './types';

/**
 * Every Chaal the game can throw at a round.
 *
 * Kept as data for the same reason Doodle Dhamaka's Dhamakas are: the picker,
 * the announcement card and the rules screen all read this one list, so adding
 * a Chaal is an entry here plus whatever it changes in the engine.
 *
 * The important number on this page is not any weight — it is `CHAAL_CHANCE`.
 * About half of all rounds have no Chaal at all, because a plain round is a
 * complete game and a Chaal is a guest. A game where every round has a twist
 * has no twists, only rules.
 */

export interface Chaal {
  id: ChaalId;
  name: string;
  emoji: string;
  /** What the table is told, in one line. */
  rule: string;
  /** Relative frequency among the Chaals that can run this round. */
  weight: number;
  /** Below this many players it is skipped. */
  minPlayers?: number;
  /** At most this many times in a match. */
  maxPerMatch?: number;
  /** Never in the opening round — a twist lands better once a plain one has. */
  notFirst?: boolean;
}

export const CHAALS: Chaal[] = [
  {
    id: 'do-chor',
    name: 'Do Chor',
    emoji: '👥',
    rule: 'There are two impostors — and they do not know about each other.',
    weight: 3,
    // Two impostors at a table of four leaves two crew, which is not a vote.
    minPlayers: 5,
    notFirst: true,
  },
  {
    id: 'ek-lafaz',
    name: 'Ek Lafaz',
    emoji: '☝️',
    rule: 'One word each. No sentences, nowhere to hide.',
    weight: 4,
  },
  {
    id: 'chup',
    name: 'Chup',
    emoji: '🤐',
    rule: 'No discussion at all. Vote on the answers alone.',
    weight: 3,
  },
  {
    id: 'safai',
    name: 'Safai',
    emoji: '⚖️',
    rule: 'The two most suspected get twenty seconds each to defend themselves.',
    weight: 4,
    minPlayers: 4,
  },
  {
    id: 'khulla-vote',
    name: 'Khulla Vote',
    emoji: '🗳️',
    rule: 'Votes show the moment they are cast. Change yours while you still can.',
    weight: 4,
  },
  {
    id: 'sab-saaf',
    name: 'Sab Saaf',
    emoji: '😇',
    rule: 'Everyone saw the question. There is no impostor — if the table can believe it.',
    weight: 1,
    maxPerMatch: 1,
    notFirst: true,
  },
];

export const chaalById = (id: ChaalId | null | undefined) =>
  id ? CHAALS.find((chaal) => chaal.id === id) : undefined;

/** How often a round draws a Chaal at all. Chaos mode is the loud version. */
export const CHAAL_CHANCE: Record<Mode, number> = {
  classic: 0.5,
  friends: 0.5,
  chaos: 0.85,
  quick: 0.4,
};

/**
 * The Chaal for a round, or null for a plain one.
 *
 * `used` is the whole match's history, which is what keeps Sab Saaf to its one
 * appearance: a surprise that happens twice is a mechanic.
 */
export function pickChaal({
  mode,
  roundNumber,
  players,
  used,
  rng,
}: {
  mode: Mode;
  roundNumber: number;
  players: number;
  used: ChaalId[];
  rng: () => number;
}): ChaalId | null {
  if (rng() >= CHAAL_CHANCE[mode]) return null;

  const eligible = CHAALS.filter((chaal) => {
    if (chaal.minPlayers && players < chaal.minPlayers) return false;
    if (chaal.notFirst && roundNumber <= 1) return false;
    if (chaal.maxPerMatch) {
      const already = used.filter((id) => id === chaal.id).length;
      if (already >= chaal.maxPerMatch) return false;
    }
    // Back to back is a rule, not a surprise.
    return used.at(-1) !== chaal.id;
  });
  if (eligible.length === 0) return null;

  const total = eligible.reduce((sum, chaal) => sum + chaal.weight, 0);
  let ticket = rng() * total;
  for (const chaal of eligible) {
    ticket -= chaal.weight;
    if (ticket <= 0) return chaal.id;
  }
  return eligible[eligible.length - 1].id;
}
