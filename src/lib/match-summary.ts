import type { GameState, Suit, TeamId } from '@/types/game';

/**
 * What actually happened in a match, read back out of its trick log.
 *
 * The log is written for every match anyway; this is the part players see. It
 * is computed on the server, where the log lives, and sent down as one small
 * object rather than shipping thirteen tricks to every client.
 */

/** The shape the socket server's trick log already has. */
export interface SummaryTrick {
  trickNumber: number;
  seats: number[];
  cards: string[];
  winnerSeat: number;
  tensWon: number;
  fixedTrump: boolean;
  trumpSuit: Suit | null;
}

export interface SeatLine {
  seat: number;
  name: string;
  team: TeamId;
  tricks: number;
  tens: number;
}

export interface MatchSummary {
  winnerTeam: TeamId | 'DRAW';
  tens: Record<TeamId, number>;
  tricks: Record<TeamId, number>;
  /** Who took each 10, in the order they were won. */
  tenCaptures: Array<{ suit: Suit; card: string; seat: number; name: string; team: TeamId; trickNumber: number }>;
  /** The cut that fixed trump, and whether the cutter took that trick. */
  cut: {
    seat: number;
    name: string;
    team: TeamId;
    card: string;
    trumpSuit: Suit;
    trickNumber: number;
    wonIt: boolean;
  } | null;
  /** The trick that carried two or more 10s, if any did. */
  biggestTrick: { trickNumber: number; seat: number; name: string; team: TeamId; tens: number } | null;
  mvp: SeatLine | null;
  seats: SeatLine[];
}

const SUIT_OF: Record<string, Suit> = {
  S: 'SPADES',
  H: 'HEARTS',
  C: 'CLUBS',
  D: 'DIAMONDS',
};

const suitOfCard = (code: string) => SUIT_OF[code.slice(-1)];
const rankOfCard = (code: string) => code.slice(0, -1);

export function buildMatchSummary(
  state: GameState,
  tricks: SummaryTrick[],
  names: Array<string | undefined>,
): MatchSummary {
  const nameOf = (seat: number) => names[seat] ?? state.players[seat]?.name ?? `Seat ${seat + 1}`;
  const teamOf = (seat: number) => state.players[seat]?.team ?? (seat === 0 || seat === 2 ? 'A' : 'B');

  const seats: SeatLine[] = [0, 1, 2, 3].map((seat) => ({
    seat,
    name: nameOf(seat),
    team: teamOf(seat),
    tricks: 0,
    tens: 0,
  }));

  const tenCaptures: MatchSummary['tenCaptures'] = [];
  let cut: MatchSummary['cut'] = null;
  let biggestTrick: MatchSummary['biggestTrick'] = null;

  for (const trick of tricks) {
    const winner = seats[trick.winnerSeat];
    if (winner) winner.tricks += 1;

    for (let i = 0; i < trick.cards.length; i += 1) {
      const card = trick.cards[i];
      if (rankOfCard(card) !== '10') continue;
      if (winner) winner.tens += 1;
      tenCaptures.push({
        suit: suitOfCard(card),
        card,
        seat: trick.winnerSeat,
        name: nameOf(trick.winnerSeat),
        team: teamOf(trick.winnerSeat),
        trickNumber: trick.trickNumber,
      });
    }

    // Only the first off-suit card fixes trump, and only one trick can do it.
    if (trick.fixedTrump && trick.trumpSuit && !cut) {
      const trumpInitial = trick.trumpSuit[0];
      const index = trick.cards.findIndex(
        (card, position) => position > 0 && card.slice(-1) === trumpInitial,
      );
      if (index !== -1) {
        const cutterSeat = trick.seats[index];
        cut = {
          seat: cutterSeat,
          name: nameOf(cutterSeat),
          team: teamOf(cutterSeat),
          card: trick.cards[index],
          trumpSuit: trick.trumpSuit,
          trickNumber: trick.trickNumber,
          wonIt: trick.winnerSeat === cutterSeat,
        };
      }
    }

    // Only a trick that swung two or more 10s is worth calling out. When each
    // 10 falls in its own trick there was no standout, and saying otherwise
    // would dress up an ordinary hand. Ties go to the earlier trick.
    if (trick.tensWon >= 2 && (!biggestTrick || trick.tensWon > biggestTrick.tens)) {
      biggestTrick = {
        trickNumber: trick.trickNumber,
        seat: trick.winnerSeat,
        name: nameOf(trick.winnerSeat),
        team: teamOf(trick.winnerSeat),
        tens: trick.tensWon,
      };
    }
  }

  // A 10 is worth far more than a trick, so it dominates the ranking; tricks
  // only separate players who took the same number of them.
  const ranked = [...seats].sort(
    (a, b) => b.tens * 3 + b.tricks - (a.tens * 3 + a.tricks) || b.tens - a.tens,
  );
  const mvp = ranked[0] && ranked[0].tricks + ranked[0].tens > 0 ? ranked[0] : null;

  return {
    winnerTeam: state.winnerTeam ?? 'DRAW',
    tens: { ...state.capturedTens },
    tricks: { ...state.handsWon },
    tenCaptures,
    cut,
    biggestTrick,
    mvp,
    seats,
  };
}
