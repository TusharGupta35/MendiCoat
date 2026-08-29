import { RANK_VALUE, determineTrickWinner, validateMove } from '@/game-engine/mendi-coat';
import type { Card, GameState, SeatIndex } from '@/types/game';

/**
 * How a bot picks its card.
 *
 * There is one bot and it plays as well as it knows how. Easy and normal
 * settings existed, and picking between them was a decision nobody wanted to
 * make before a game — a table wants opponents worth beating, not a difficulty
 * screen. So the bot protects its 10s, feeds them to a partner who is winning,
 * takes tricks with the cheapest card that does the job, and spends a 10 when
 * the trick already carries one.
 */

const valueOf = (card: Card) => RANK_VALUE[card.rank] ?? 0;
const isTen = (card: Card) => card.rank === '10';
const lowest = (cards: Card[]) => [...cards].sort((a, b) => valueOf(a) - valueOf(b))[0];
const highest = (cards: Card[]) => [...cards].sort((a, b) => valueOf(b) - valueOf(a))[0];

/** Prefer a card that is not a 10, since a 10 thrown away is a point given. */
function sparing(cards: Card[], pick: (cards: Card[]) => Card) {
  const safe = cards.filter((card) => !isTen(card));
  return pick(safe.length > 0 ? safe : cards);
}

/**
 * Would this card be winning the trick if played now?
 *
 * Trump is applied the way the engine applies it: a card that goes off-suit
 * when nothing is trump yet fixes trump itself, and so wins with it.
 */
export function wouldWin(state: GameState, seat: SeatIndex, card: Card): boolean {
  if (state.trickCards.length === 0) return true;
  const leadSuit = state.trickCards[0].card.suit;
  const trumpSuit =
    state.trumpSuit === null && card.suit !== leadSuit ? card.suit : state.trumpSuit;
  const projected: GameState = {
    ...state,
    trumpSuit,
    trickCards: [...state.trickCards, { seat, card }],
  };
  return determineTrickWinner(projected) === seat;
}

const teamOf = (seat: number) => (seat === 0 || seat === 2 ? 'A' : 'B');

export function chooseBotCard(state: GameState, seat: SeatIndex): Card | undefined {
  const player = state.players.find((entry) => entry.seat === seat);
  if (!player) return undefined;

  const legal = player.cards.filter((card) => validateMove(state, seat, card).valid);
  if (legal.length === 0) return undefined;
  if (legal.length === 1) return legal[0];

  // ── Leading ────────────────────────────────────────────────────────────────
  if (state.trickCards.length === 0) {
    const bySuit = new Map<string, Card[]>();
    for (const card of legal) bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card]);

    // Lead the suit that is both long and strong: length means the high card is
    // likelier to survive, and a high card means it is worth leading at all. A
    // suit of five rags is a worse lead than a short suit holding the ace.
    // Trump is kept back rather than spent leading.
    const strength = (cards: Card[]) => valueOf(highest(cards)) + cards.length * 3;
    const suits = [...bySuit.entries()]
      .filter(([suit]) => suit !== state.trumpSuit || bySuit.size === 1)
      .sort((a, b) => strength(b[1]) - strength(a[1]));
    const fromSuit = suits[0]?.[1] ?? legal;
    return sparing(fromSuit, highest);
  }

  // ── Following ──────────────────────────────────────────────────────────────
  const winningSeat = determineTrickWinner(state);
  const partnerIsWinning = teamOf(winningSeat) === teamOf(seat);
  const trickHasTen = state.trickCards.some((play) => isTen(play.card));

  if (partnerIsWinning) {
    // A 10 handed to a partner who is winning is a point banked, not lost.
    const tens = legal.filter(isTen);
    if (tens.length > 0) return tens[0];
    return sparing(legal, lowest);
  }

  const winners = legal.filter((card) => wouldWin(state, seat, card));
  if (winners.length > 0) {
    // Win with the cheapest card that does it, so the big ones stay in hand.
    // With nothing else that wins, a trick already carrying a 10 is worth
    // spending a 10 on — the 10 is going somewhere either way, and this way it
    // comes home. A trick with no 10 in it is not.
    const affordable = winners.filter((card) => !isTen(card));
    if (affordable.length > 0) return lowest(affordable);
    if (trickHasTen) return lowest(winners);
    return sparing(legal, lowest);
  }

  // Cannot win it, so lose as cheaply as possible and never donate a 10.
  return sparing(legal, lowest);
}
