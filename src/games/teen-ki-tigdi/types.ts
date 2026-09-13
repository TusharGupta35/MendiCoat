import type { Card, Suit } from '@/types/game';

/**
 * Teen Ki Tigdi — a Kaali Teeri-style bidding game for 5, 6 or 7.
 *
 * Its state is kept apart from Mendi Coat's rather than folded into it. The two
 * games agree on almost nothing that matters: seats are 0..n-1 instead of four,
 * teams are decided mid-hand instead of by where you sit, and half the state is
 * meant to be secret. A shared shape would be a union of two games with the
 * fields of the other one always null.
 */

export type { Card, Suit };

export type TigdiSeat = number;

/** Which side of the table you are on, once that is known. */
export type TigdiTeam = 'BIDDER' | 'OPPONENT';

export type TigdiPhase =
  | 'BIDDING'
  /** Bidding is won; the bidder is choosing trump and calling partners. */
  | 'CALLING'
  | 'PLAYING'
  | 'FINISHED'
  /** Everyone passed. No hand to play — the table deals again. */
  | 'PASSED_OUT';

export interface TigdiPlay {
  seat: TigdiSeat;
  card: Card;
}

export interface TigdiPlayer {
  seat: TigdiSeat;
  name: string;
  cards: Card[];
  /**
   * The team this seat is actually on. Filled in the moment partners are
   * called — the server knows the whole truth from then on, and hands out only
   * as much of it as each seat is allowed to see.
   */
  team: TigdiTeam | null;
  /** Highest bid this seat has made, or null if they never bid. */
  bid: number | null;
  /** Out of the bidding for good. */
  passed: boolean;
}

export interface TigdiBidEntry {
  seat: TigdiSeat;
  /** null is a pass. */
  amount: number | null;
}

export interface TigdiResult {
  bid: number;
  bidderSeat: TigdiSeat;
  trumpSuit: Suit;
  calledCards: string[];
  points: Record<TigdiTeam, number>;
  /** Did the bidder's team make its bid? */
  made: boolean;
  winners: TigdiTeam;
}

export interface TigdiState {
  roomCode: string;
  playerCount: number;
  phase: TigdiPhase;
  players: TigdiPlayer[];

  /** Whose move it is, in whatever phase the hand is in. */
  currentTurn: TigdiSeat;

  // ── Bidding ───────────────────────────────────────────────────────────────
  /** The standing bid, or null while nobody has opened. */
  highBid: number | null;
  highBidder: TigdiSeat | null;
  /** Every bid and pass in order, so the table can read how it went. */
  bidLog: TigdiBidEntry[];

  // ── The contract ──────────────────────────────────────────────────────────
  trumpSuit: Suit | null;
  /**
   * The cards the bidder called to name their partners, as card codes. Public
   * from the moment they are called: everyone knows *which* cards were called,
   * nobody knows *who* holds them.
   */
  calledCards: string[];
  /** Called card code → the seat that played it, once it has been played. */
  revealed: Record<string, TigdiSeat>;

  // ── Play ──────────────────────────────────────────────────────────────────
  trickNumber: number;
  trickCards: TigdiPlay[];
  lastTrick?: { cards: TigdiPlay[]; winner: TigdiSeat };
  /** Points captured, by team. They always sum to 250 once the hand is over. */
  points: Record<TigdiTeam, number>;
  /**
   * Points captured by each seat.
   *
   * This is the public half of the score, and the only half anyone may see
   * while the hand is live: who took which trick, and what was in it, happened
   * in front of everybody. Turning that into a team total is the deduction the
   * game is made of — see the note on TigdiView.points.
   */
  pointsBySeat: number[];
  /** Tricks taken per seat, for the summary. */
  tricksBySeat: number[];
  result?: TigdiResult;
}

/**
 * What one seat is allowed to see. Same shape as the full state, minus every
 * other player's hand and minus any team that has not yet been given away.
 *
 * The redaction is the point of the game, so it happens on the server: hidden
 * partners are worth nothing if the truth is sitting in the browser.
 */
export interface TigdiView extends Omit<TigdiState, 'players' | 'points'> {
  /** The seat this view was built for, or null for a spectator. */
  you: TigdiSeat | null;
  /**
   * The team totals — but only once the hand is over. Null until then, and that
   * is not a nicety.
   *
   * A team total moves by the value of a trick the moment somebody wins one. If
   * the table could watch it move, an unrevealed player taking a 20-point trick
   * would be named by the scoreboard the instant they took it, and the hidden
   * partners would not survive the first trick that mattered. What each *seat*
   * has captured is public (`pointsBySeat`); adding those up into sides is the
   * work the players are supposed to do.
   */
  points: Record<TigdiTeam, number> | null;
  players: Array<Omit<TigdiPlayer, 'cards'> & {
    /** Only ever populated for `you`. */
    cards: Card[] | null;
    cardsLeft: number;
  }>;
}
