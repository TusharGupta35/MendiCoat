import type { TeamId } from '@/types/game';

/**
 * Pure computation over match rows. Kept free of Prisma so the rules that
 * decide a rank, a streak or an achievement can be tested directly on data
 * rather than through a database.
 */

/** One finished match as far as stats are concerned, from one player's side. */
export interface PlayedMatch {
  id: string;
  finishedAt: Date | null;
  winnerTeam: string;
  capturedTensA: number;
  capturedTensB: number;
  handsWonA: number;
  handsWonB: number;
  hadBots: boolean;
  /** The team this player sat on, and the seat they sat in. */
  team: TeamId;
  seat: number;
  /** Every other human seat in the match. */
  others: Array<{ userId: string; name: string; avatar: string | null; seat: number; team: TeamId }>;
  tricks: PlayedTrick[];
}

export interface PlayedTrick {
  trickNumber: number;
  seats: number[];
  cards: string[];
  leadSuit: string;
  winnerSeat: number;
  winnerTeam: string;
  tensWon: number;
  fixedTrump: boolean;
}

export interface CareerStats {
  played: number;
  won: number;
  lost: number;
  drawn: number;
  /** 0–100, rounded. Draws count as played but not won. */
  winRate: number;
  tensCaptured: number;
  coatsDealt: number;
  coatsTaken: number;
  currentStreak: number;
  bestStreak: number;
}

const teamOf = (match: PlayedMatch, key: 'tens' | 'hands', team: TeamId) =>
  key === 'tens'
    ? team === 'A' ? match.capturedTensA : match.capturedTensB
    : team === 'A' ? match.handsWonA : match.handsWonB;

export const myTens = (match: PlayedMatch) => teamOf(match, 'tens', match.team);
export const theirTens = (match: PlayedMatch) =>
  teamOf(match, 'tens', match.team === 'A' ? 'B' : 'A');
export const myHands = (match: PlayedMatch) => teamOf(match, 'hands', match.team);
export const didWin = (match: PlayedMatch) => match.winnerTeam === match.team;
export const wasDrawn = (match: PlayedMatch) => match.winnerTeam === 'DRAW';

/** Newest first, which is the order results are read in. */
function byNewest(a: PlayedMatch, b: PlayedMatch) {
  return (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0);
}

export function careerStats(matches: PlayedMatch[]): CareerStats {
  const ordered = [...matches].sort(byNewest);
  const won = ordered.filter(didWin).length;
  const drawn = ordered.filter(wasDrawn).length;

  // The current streak is the unbroken run of wins at the newest end; the best
  // is the longest such run anywhere. A draw breaks both.
  let currentStreak = 0;
  let bestStreak = 0;
  let run = 0;
  // A separate flag rather than `currentStreak === 0`, because zero is itself a
  // valid answer — the newest match being a loss ends the streak at nothing.
  let currentSettled = false;
  for (const match of ordered) {
    if (didWin(match)) {
      run += 1;
      bestStreak = Math.max(bestStreak, run);
    } else {
      if (!currentSettled) {
        currentStreak = run;
        currentSettled = true;
      }
      run = 0;
    }
  }
  // Never interrupted, so the run at the newest end is the whole history.
  if (!currentSettled) currentStreak = run;

  return {
    played: ordered.length,
    won,
    lost: ordered.length - won - drawn,
    drawn,
    winRate: ordered.length === 0 ? 0 : Math.round((won / ordered.length) * 100),
    tensCaptured: ordered.reduce((total, match) => total + myTens(match), 0),
    coatsDealt: ordered.filter((match) => myTens(match) === 4).length,
    coatsTaken: ordered.filter((match) => theirTens(match) === 4).length,
    currentStreak,
    bestStreak,
  };
}

export interface PartnerRecord {
  userId: string;
  name: string;
  avatar: string | null;
  played: number;
  won: number;
  winRate: number;
}

/**
 * Win rate per partner — the player sitting opposite, on the same team. Sorted
 * by most played, since a 100% record over one match says nothing.
 */
export function partnerRecords(matches: PlayedMatch[]): PartnerRecord[] {
  const byPartner = new Map<string, PartnerRecord>();

  for (const match of matches) {
    const partner = match.others.find((other) => other.team === match.team);
    if (!partner) continue;
    const record = byPartner.get(partner.userId) ?? {
      userId: partner.userId,
      name: partner.name,
      avatar: partner.avatar,
      played: 0,
      won: 0,
      winRate: 0,
    };
    record.played += 1;
    if (didWin(match)) record.won += 1;
    record.winRate = Math.round((record.won / record.played) * 100);
    byPartner.set(partner.userId, record);
  }

  return [...byPartner.values()].sort(
    (a, b) => b.played - a.played || b.winRate - a.winRate,
  );
}

/** Card codes are rank + suit initial, e.g. "10H", "AS", "2C". */
export function rankOfCard(code: string) {
  return code.slice(0, -1);
}

/** The seat that fixed trump on a cutting trick: first to play off-suit. */
export function cutterOf(trick: PlayedTrick): { seat: number; card: string } | null {
  if (!trick.fixedTrump) return null;
  const leadInitial = trick.leadSuit[0];
  for (let i = 0; i < trick.cards.length; i += 1) {
    if (trick.cards[i].slice(-1) !== leadInitial) {
      return { seat: trick.seats[i], card: trick.cards[i] };
    }
  }
  return null;
}
