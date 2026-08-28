import { RANK_VALUE, determineTrickWinner, validateMove } from '@/game-engine/mendi-coat';
import type { Card, GameState, SeatIndex } from '@/types/game';

/**
 * How a bot picks its card.
 *
 * The old bot played a random legal card, which is why a solo game felt like
 * noise. These levels play the actual game: protect 10s, feed them to a partner
 * who is winning, and win tricks with the cheapest card that does the job.
 */
export type BotLevel = 'easy' | 'normal' | 'hard';

export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
export const isBotLevel = (value: unknown): value is BotLevel =>
  typeof value === 'string' && (BOT_LEVELS as string[]).includes(value);

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

export function chooseBotCard(
  state: GameState,
  seat: SeatIndex,
  level: BotLevel = 'normal',
): Card | undefined {
  const player = state.players.find((entry) => entry.seat === seat);
  if (!player) return undefined;

  const legal = player.cards.filter((card) => validateMove(state, seat, card).valid);
  if (legal.length === 0) return undefined;
  if (legal.length === 1) return legal[0];

  // The original bot, kept as the easy setting. Hands are suit-sorted, so a
  // random pick also stops a leading bot opening with a spade every time.
  if (level === 'easy') return legal[Math.floor(Math.random() * legal.length)];

  // ── Leading ────────────────────────────────────────────────────────────────
  if (state.trickCards.length === 0) {
    const bySuit = new Map<string, Card[]>();
    for (const card of legal) bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card]);

    // Lead from the longest suit: the more of it held, the likelier the high
    // card survives. Trump is kept back rather than spent leading.
    const suits = [...bySuit.entries()]
      .filter(([suit]) => suit !== state.trumpSuit || bySuit.size === 1)
      .sort((a, b) => b[1].length - a[1].length);
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
    // On hard, a trick already carrying a 10 is worth spending a 10 to take.
    const affordable = winners.filter((card) => !isTen(card));
    if (affordable.length > 0) return lowest(affordable);
    if (level === 'hard' && trickHasTen) return lowest(winners);
    return affordable.length > 0 ? lowest(affordable) : lowest(winners);
  }

  // Cannot win it, so lose as cheaply as possible and never donate a 10.
  return sparing(legal, lowest);
}
