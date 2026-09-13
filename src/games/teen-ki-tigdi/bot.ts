import {
  BID_STEP,
  MAX_BID,
  PARTNER_CALLS,
  RANK_VALUE,
  cardPoints,
  determineTrickWinner,
} from '@/games/teen-ki-tigdi/engine';
import type { TigdiPlayerCount } from '@/games/teen-ki-tigdi/engine';
import type { Card, Suit, TigdiSeat, TigdiView } from '@/games/teen-ki-tigdi/types';

/**
 * How a bot plays Teen Ki Tigdi.
 *
 * Every function here takes a *view* rather than the real state, which is the
 * whole safety argument: a bot literally cannot see another hand or an
 * unrevealed partner, because the object it is handed does not contain them. It
 * deduces from the same information a person at the table has.
 *
 * It plays a solid, unsurprising game — bid what the hand is worth, call the
 * aces you are missing, take the tricks that carry points, and never hand 30
 * points to someone whose side you cannot name. It does not bluff, does not
 * signal, and does not count the deck. That is deliberate for a first draft:
 * the bots are here so five friends can start a seven-seat table, not to be the
 * opposition worth beating.
 */

const SUITS: Suit[] = ['SPADES', 'HEARTS', 'CLUBS', 'DIAMONDS'];

const bySuit = (cards: Card[]) => {
  const map = new Map<Suit, Card[]>();
  for (const card of cards) map.set(card.suit, [...(map.get(card.suit) ?? []), card]);
  return map;
};

const myHand = (view: TigdiView): Card[] => {
  const seat = view.you;
  return (seat === null ? null : view.players[seat]?.cards) ?? [];
};

/**
 * What this hand looks like it can bring in, in points.
 *
 * Aces and kings are counted as tricks the hand expects to win rather than as
 * their own face value, because a trick is worth whatever everyone throws into
 * it. Length matters for the same reason: the fifth card of a suit wins by
 * being the last one standing, not by being high.
 */
function handStrength(cards: Card[]): number {
  let strength = 0;
  for (const card of cards) {
    if (card.rank === 'A') strength += 15;
    else if (card.rank === 'K') strength += 10;
    else if (card.rank === 'Q') strength += 6;
    else if (card.rank === 'J') strength += 4;
    else if (card.rank === '10') strength += 3;
    // The tigdi is 30 points sitting in your own hand, which is worth having
    // even though a low spade wins nothing.
    if (card.code === '3S') strength += 10;
  }

  const suits = bySuit(cards);
  const longest = Math.max(0, ...[...suits.values()].map((group) => group.length));
  strength += Math.max(0, longest - 3) * 7;
  // A void is a free cut once trump is yours to name.
  strength += (4 - suits.size) * 5;
  return strength;
}

/**
 * The most this bot is willing to commit to.
 *
 * The bidder is never playing alone — two called partners bring points of their
 * own — so the ceiling starts well above what the hand can take by itself. A
 * little jitter per bot keeps a table of them from bidding in lockstep.
 */
export function bidCeiling(view: TigdiView): number {
  const base = 105 + Math.round(handStrength(myHand(view)) * 0.75);
  const jitter = Math.floor(Math.random() * 3) * BID_STEP;
  const capped = Math.min(MAX_BID - 40, base + jitter);
  return Math.round(capped / BID_STEP) * BID_STEP;
}

/** The bot's bid, or null to pass. */
export function chooseTigdiBid(view: TigdiView, floor: number): number | null {
  return floor <= bidCeiling(view) ? floor : null;
}

/**
 * Trump, and the cards called to find partners.
 *
 * Trump is the bot's longest suit, breaking ties on high cards — length wins
 * more tricks than strength does once a suit is trump. The calls are the best
 * cards it does *not* hold, taken from the suits it is weakest in, because a
 * partner is most use where this hand is thinnest.
 */
export function chooseTigdiContract(view: TigdiView): { trumpSuit: Suit; calledCards: string[] } {
  const hand = myHand(view);
  const suits = bySuit(hand);

  const trumpSuit = SUITS.reduce((best, suit) => {
    const group = suits.get(suit) ?? [];
    const bestGroup = suits.get(best) ?? [];
    const score = group.length * 10 + Math.max(0, ...group.map((c) => RANK_VALUE[c.rank]), 0);
    const bestScore = bestGroup.length * 10 + Math.max(0, ...bestGroup.map((c) => RANK_VALUE[c.rank]), 0);
    return score > bestScore ? suit : best;
  }, SUITS[0]);

  const held = new Set(hand.map((card) => card.code));
  const wanted: string[] = [];
  // Aces first, then kings — the cards that actually pull a trick in, ordered
  // so the suits this hand is shortest in get covered first.
  for (const rank of ['A', 'K', 'Q']) {
    const ordered = [...SUITS].sort((a, b) => (suits.get(a)?.length ?? 0) - (suits.get(b)?.length ?? 0));
    for (const suit of ordered) {
      const code = `${rank}${suit[0]}`;
      // A card trimmed from this deck size can never be called.
      if (!held.has(code) && !wanted.includes(code)) wanted.push(code);
    }
  }

  const required = PARTNER_CALLS[view.playerCount as TigdiPlayerCount];
  return { trumpSuit, calledCards: wanted.slice(0, required) };
}

// ── Playing a card ──────────────────────────────────────────────────────────

const legalCards = (view: TigdiView): Card[] => {
  const hand = myHand(view);
  if (view.trickCards.length === 0) return hand;
  const leadSuit = view.trickCards[0].card.suit;
  const following = hand.filter((card) => card.suit === leadSuit);
  return following.length > 0 ? following : hand;
};

const cheapest = (cards: Card[]) =>
  [...cards].sort(
    (a, b) => cardPoints(a) - cardPoints(b) || RANK_VALUE[a.rank] - RANK_VALUE[b.rank],
  )[0];

const richest = (cards: Card[]) =>
  [...cards].sort(
    (a, b) => cardPoints(b) - cardPoints(a) || RANK_VALUE[b.rank] - RANK_VALUE[a.rank],
  )[0];

/** Would this card be taking the trick if it were played now? */
function wouldWin(view: TigdiView, seat: TigdiSeat, card: Card): boolean {
  if (view.trickCards.length === 0) return true;
  return determineTrickWinner([...view.trickCards, { seat, card }], view.trumpSuit) === seat;
}

export function chooseTigdiCard(view: TigdiView): Card | undefined {
  const seat = view.you;
  if (seat === null) return undefined;
  const legal = legalCards(view);
  if (legal.length <= 1) return legal[0];

  const myTeam = view.players[seat]?.team ?? null;
  const pointsOnTable = view.trickCards.reduce((sum, play) => sum + cardPoints(play.card), 0);
  // Everyone still to play after this bot. A trick with people left to act on
  // it is not safe to throw points into, however good it looks right now.
  const yetToPlay = view.playerCount - view.trickCards.length - 1;

  // ── Leading ───────────────────────────────────────────────────────────────
  if (view.trickCards.length === 0) {
    const suits = bySuit(legal);
    const candidates = [...suits.entries()].filter(
      ([suit]) => suit !== view.trumpSuit || suits.size === 1,
    );
    const pool = candidates.length > 0 ? candidates : [...suits.entries()];
    // Lead from the suit whose top card is likeliest to survive: high, and
    // backed by length.
    const [, group] = pool.sort(
      (a, b) =>
        Math.max(...b[1].map((c) => RANK_VALUE[c.rank])) + b[1].length * 3 -
        (Math.max(...a[1].map((c) => RANK_VALUE[c.rank])) + a[1].length * 3),
    )[0];
    const top = [...group].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])[0];
    // An ace or king leads itself. Anything lower is just feeding the table, so
    // lead the cheapest card of that suit instead.
    return RANK_VALUE[top.rank] >= 13 ? top : cheapest(group);
  }

  // ── Following ─────────────────────────────────────────────────────────────
  const winningSeat = determineTrickWinner(view.trickCards, view.trumpSuit);
  const winningTeam = view.players[winningSeat]?.team ?? null;
  // Only a team that has already given itself away can be counted on. An
  // unknown seat is treated as an opponent — the safe reading.
  const partnerWinning = myTeam !== null && winningTeam !== null && winningTeam === myTeam;

  if (partnerWinning && yetToPlay === 0) {
    // Last to play and the trick is already ours: every point thrown in is
    // banked, so throw the biggest one.
    return richest(legal);
  }

  const winners = legal.filter((card) => wouldWin(view, seat, card));
  if (winners.length > 0 && !partnerWinning) {
    // Win it with the least valuable card that does the job. A trick with
    // nothing in it is not worth spending a good card on.
    const worthTaking = pointsOnTable > 0 || view.trickCards.length >= view.playerCount - 2;
    if (worthTaking) return cheapest(winners);
  }

  // Cannot take it, or should not — get out of it as cheaply as possible and
  // never donate the tigdi.
  return cheapest(legal);
}
