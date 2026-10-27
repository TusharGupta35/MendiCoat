import type { TeamId } from '@/types/game';

/**
 * Turning a finished match into a line of the feed.
 *
 * Pure, and split from the query the way stats-core is split from stats: the
 * wording IS the feature here, so it has to be testable without a database.
 *
 * The dashboard could say how you are doing and who is ahead, but not what
 * anybody actually did — so signing in told a returning player nothing new.
 * This is that: the last few finished matches, written as a line each.
 */

export interface ActivityEntry {
  matchId: string;
  at: Date;
  /** 'coat' — all four 10s; 'win' — an ordinary result; 'draw'. */
  kind: 'coat' | 'win' | 'draw';
  /** The sentence, already assembled: "Kabir & Neha beat Rohan & Aman". */
  headline: string;
  /** The score, or null for a draw. */
  detail: string | null;
  /** Whether the player reading the feed was in this match. */
  mine: boolean;
}

export interface ActivitySeat {
  userId: string;
  name: string;
  team: string;
  /** Whether this seat won. Only the games without fixed teams need it. */
  won?: boolean;
}

export interface ActivityMatch {
  id: string;
  finishedAt: Date | null;
  winnerTeam: string | null;
  capturedTensA: number;
  capturedTensB: number;
  seats: ActivitySeat[];
  /** Which game this was. Missing means Mendi Coat, the only game there once was. */
  gameId?: string;
  /** The game's own record of the result — see `Match.detail`. */
  detail?: unknown;
}

/** "Kabir & Neha", "Kabir", "Kabir, Neha & Rohan" — however many sat there. */
export function joinNames(names: string[]): string {
  if (names.length === 0) return 'nobody';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

const namesOn = (match: ActivityMatch, team: TeamId, meId: string | null) =>
  match.seats
    .filter((seat) => seat.team === team)
    // Your own name is the one you scan for, so it is written as "You" and
    // pulled to the front of its side.
    .sort((a, b) => Number(b.userId === meId) - Number(a.userId === meId))
    .map((seat) => (seat.userId === meId ? 'You' : seat.name));

/**
 * One finished match as a line of the feed.
 *
 * Pure, so the wording can be tested without a database — which matters here
 * because the wording is the whole feature.
 */
export function describeMatch(match: ActivityMatch, meId: string | null): ActivityEntry | null {
  if (match.gameId === 'TEEN_KI_TIGDI') return describeTigdiHand(match, meId);
  if (match.gameId === 'IMPOSTOR') return describePartyGame(match, meId, 'Impostor');
  if (match.gameId === 'DOODLE_DHAMAKA') return describePartyGame(match, meId, 'Doodle Dhamaka');
  if (!match.finishedAt || !match.winnerTeam) return null;

  const mine = meId !== null && match.seats.some((seat) => seat.userId === meId);
  const at = match.finishedAt;

  if (match.winnerTeam === 'DRAW') {
    const a = joinNames(namesOn(match, 'A', meId));
    const b = joinNames(namesOn(match, 'B', meId));
    return { matchId: match.id, at, kind: 'draw', headline: `${a} and ${b} drew`, detail: null, mine };
  }

  const winners = match.winnerTeam === 'A' ? 'A' : 'B';
  const losers = winners === 'A' ? 'B' : 'A';
  const won = joinNames(namesOn(match, winners, meId));
  const lost = joinNames(namesOn(match, losers, meId));
  const tensWon = winners === 'A' ? match.capturedTensA : match.capturedTensB;
  const tensLost = winners === 'A' ? match.capturedTensB : match.capturedTensA;

  // All four 10s is a coat — the thing the game is named for, and the only
  // result worth a different sentence.
  if (tensWon === 4) {
    return {
      matchId: match.id,
      at,
      kind: 'coat',
      headline: `${won} dealt a coat to ${lost}`,
      detail: 'all four 10s',
      mine,
    };
  }

  return {
    matchId: match.id,
    at,
    kind: 'win',
    headline: `${won} beat ${lost}`,
    detail: `${tensWon}–${tensLost} on 10s`,
    mine,
  };
}

/** The seats matching `keep`, written the way namesOn writes a team. */
const namesWhere = (match: ActivityMatch, meId: string | null, keep: (seat: ActivitySeat) => boolean) =>
  match.seats
    .filter(keep)
    .sort((a, b) => Number(b.userId === meId) - Number(a.userId === meId))
    .map((seat) => (seat.userId === meId ? 'You' : seat.name));

/**
 * Impostor and Doodle Dhamaka: everyone for themselves, so the line is just who
 * came out on top. A game where nobody scored names the table instead.
 */
function describePartyGame(match: ActivityMatch, meId: string | null, game: string): ActivityEntry | null {
  if (!match.finishedAt || match.seats.length === 0) return null;
  const mine = meId !== null && match.seats.some((seat) => seat.userId === meId);
  const winners = namesWhere(match, meId, (seat) => seat.won === true);
  const players = `${match.seats.length} ${match.seats.length === 1 ? 'player' : 'players'}`;

  if (winners.length === 0) {
    return {
      matchId: match.id,
      at: match.finishedAt,
      kind: 'draw',
      headline: `${joinNames(namesWhere(match, meId, () => true))} played ${game}`,
      detail: null,
      mine,
    };
  }
  return {
    matchId: match.id,
    at: match.finishedAt,
    kind: 'win',
    headline: `${joinNames(winners)} won ${game}`,
    detail: players,
    mine,
  };
}

interface TigdiDetail {
  bid?: number;
  made?: boolean;
  points?: { BIDDER?: number; OPPONENT?: number };
}

/**
 * One Teen Ki Tigdi hand. Bots are not recorded as seats, so a side made up
 * entirely of bots is written as such rather than as "nobody".
 */
function describeTigdiHand(match: ActivityMatch, meId: string | null): ActivityEntry | null {
  const detail = (match.detail ?? {}) as TigdiDetail;
  if (!match.finishedAt || typeof detail.bid !== 'number' || typeof detail.made !== 'boolean') return null;

  const mine = meId !== null && match.seats.some((seat) => seat.userId === meId);
  const side = (team: string) => {
    const names = namesWhere(match, meId, (seat) => seat.team === team);
    return names.length > 0 ? joinNames(names) : 'the bots';
  };
  const bidders = side('BIDDER');
  const score =
    detail.points?.BIDDER !== undefined && detail.points.OPPONENT !== undefined
      ? `${detail.points.BIDDER}–${detail.points.OPPONENT} in Teen Ki Tigdi`
      : 'Teen Ki Tigdi';

  return {
    matchId: match.id,
    at: match.finishedAt,
    kind: 'win',
    headline: detail.made
      ? `${bidders} made a ${detail.bid} bid`
      : `${bidders} went down on a ${detail.bid} bid`,
    detail: score,
    mine,
  };
}
