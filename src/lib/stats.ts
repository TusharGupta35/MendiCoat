import { prisma } from '@/lib/prisma';
import { currentChallenges, weekOf, weekStart, type ChallengeState } from '@/lib/challenges';
import { evaluateFeats, type FeatState } from '@/lib/feats';
import { snapshotFrom, type ProgressSnapshot } from '@/lib/progress-feed';
import {
  bandForLevel,
  levelFromXp,
  milestoneStates,
  totalXpFor,
  type Level,
  type MilestoneState,
} from '@/lib/progression';
import {
  careerStats,
  partnerRecords,
  type CareerStats,
  type PartnerRecord,
  type PlayedMatch,
} from '@/lib/stats-core';
import type { TeamId } from '@/types/game';

/**
 * Reads the durable match record and hands it to the pure functions in
 * stats-core and achievements. Only FINISHED matches count — a game that was
 * abandoned keeps its PENDING row, which is what makes completion rate
 * answerable, but it is nobody's win or loss.
 */

/**
 * Stats are a side panel on pages that have to render without them — the
 * dashboard is not broken just because a record could not be counted. Every
 * query degrades to an empty record and says why in the log.
 */
async function safely<T>(what: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'P2021') {
      // The schema has not been pushed yet; nothing is wrong with the code.
      console.error(`${what}: the match tables do not exist yet. Run \`npx prisma db push\`.`);
    } else {
      console.error(`${what} failed:`, error);
    }
    return fallback;
  }
}

const displayName = (user: { username: string | null; name: string | null } | null) =>
  user?.username ?? user?.name ?? 'player';

/** The later of two moments, either of which may be missing. */
const newest = (a: Date | null, b: Date | null) =>
  !a ? b : !b ? a : a.getTime() >= b.getTime() ? a : b;

export interface PlayerStats {
  stats: CareerStats;
  level: Level;
  band: { name: string; nextAt: number | null };
  partners: PartnerRecord[];
  milestones: MilestoneState[];
  feats: FeatState[];
  challenges: ChallengeState[];
}

function progressFor(matches: PlayedMatch[]): PlayerStats {
  const level = levelFromXp(totalXpFor(matches));
  return {
    stats: careerStats(matches),
    level,
    band: bandForLevel(level.level),
    partners: partnerRecords(matches),
    milestones: milestoneStates(matches),
    feats: evaluateFeats(matches),
    challenges: currentChallenges(matches),
  };
}

/**
 * Everything a stats calculation needs from one seat in one match. Shared, so
 * the career query and the XP board can never end up reading a different match
 * from each other.
 */
const MATCH_SELECT = {
  seat: true,
  team: true,
  match: {
    select: {
      id: true,
      finishedAt: true,
      winnerTeam: true,
      capturedTensA: true,
      capturedTensB: true,
      handsWonA: true,
      handsWonB: true,
      hadBots: true,
      seriesId: true,
      seriesTarget: true,
      seats: {
        select: {
          userId: true,
          seat: true,
          team: true,
          user: { select: { username: true, name: true, avatar: true } },
        },
      },
      tricks: {
        select: {
          trickNumber: true,
          seats: true,
          cards: true,
          leadSuit: true,
          winnerSeat: true,
          winnerTeam: true,
          tensWon: true,
          fixedTrump: true,
        },
        orderBy: { trickNumber: 'asc' },
      },
    },
  },
} as const;

/** One row of the match record, seen from the seat that played it. */
type SeatRow = {
  seat: number;
  team: string;
  match: {
    id: string;
    finishedAt: Date | null;
    winnerTeam: string | null;
    capturedTensA: number;
    capturedTensB: number;
    handsWonA: number;
    handsWonB: number;
    hadBots: boolean;
    seriesId: string | null;
    seriesTarget: number | null;
    seats: Array<{
      userId: string;
      seat: number;
      team: string;
      user: { username: string | null; name: string | null; avatar: string | null } | null;
    }>;
    tricks: Array<{
      trickNumber: number;
      seats: number[];
      cards: string[];
      leadSuit: string;
      winnerSeat: number;
      winnerTeam: string;
      tensWon: number;
      fixedTrump: boolean;
    }>;
  };
};

function toPlayedMatch(userId: string, { seat, team, match }: SeatRow): PlayedMatch {
  return {
    id: match.id,
    finishedAt: match.finishedAt,
    // A finished match always has a winner recorded; treat anything else as a draw.
    winnerTeam: match.winnerTeam ?? 'DRAW',
    capturedTensA: match.capturedTensA,
    capturedTensB: match.capturedTensB,
    handsWonA: match.handsWonA,
    handsWonB: match.handsWonB,
    hadBots: match.hadBots,
    seriesId: match.seriesId,
    seriesTarget: match.seriesTarget,
    team: team as TeamId,
    seat,
    others: match.seats
      .filter((other) => other.userId !== userId)
      .map((other) => ({
        userId: other.userId,
        name: displayName(other.user),
        avatar: other.user?.avatar ?? null,
        seat: other.seat,
        team: other.team as TeamId,
      })),
    tricks: match.tricks,
  };
}

async function playedMatches(userId: string): Promise<PlayedMatch[]> {
  const seats = await prisma.matchPlayer.findMany({
    where: { userId, match: { status: 'FINISHED' } },
    select: MATCH_SELECT,
  });
  return seats.map((row) => toPlayedMatch(userId, row));
}

export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  // Falls back to a blank record, so every tier and feat shows as unearned
  // rather than the page losing its panels.
  return safely('Reading player stats', progressFor([]), async () =>
    progressFor(await playedMatches(userId)),
  );
}

/**
 * The dashboard's four-number summary. A separate, leaner query than
 * getPlayerStats on purpose: the card needs no trick log and no partner names,
 * and the dashboard is the most-visited page in the app.
 */
/*
 * There is deliberately no lighter "summary" query. An earlier version had one
 * for the dashboard card, but a level counts feats and challenges, which are
 * computed from the trick log — so a query that skipped tricks produced a lower
 * level on the dashboard than on the stats page. One path, one answer.
 */

/** What the player has unlocked, for the celebration to diff against. */
export async function getProgressSnapshot(userId: string): Promise<ProgressSnapshot> {
  const { level, milestones, feats, challenges } = await getPlayerStats(userId);
  return snapshotFrom(level, milestones, feats, challenges, weekOf(new Date()));
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  avatar: string | null;
  played: number;
  won: number;
  winRate: number;
  /** When they last finished a match — the only activity the app records. */
  lastPlayed: Date | null;
}

/**
 * Ranked by wins, then win rate. Matches that had bots in them are excluded —
 * beating three bots should not climb a leaderboard.
 *
 * Counted in memory rather than with a grouped aggregate, because `won` is a
 * boolean and Postgres cannot sum it directly. Fine at this size; it would need
 * a real aggregate if the table ever grew large.
 */
export async function getLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  return safely('Reading the leaderboard', [], () => leaderboard(limit));
}

/**
 * The same ranking over this week's matches only. The week runs Monday to
 * Monday in UTC, the boundary the weekly challenges already use, so a player
 * who sees their challenges reset also sees the board reset.
 */
export async function getWeeklyLeaderboard(limit = 5, now = new Date()): Promise<LeaderboardRow[]> {
  return safely('Reading the weekly leaderboard', [], () =>
    leaderboard(limit, weekStart(weekOf(now))),
  );
}

async function leaderboard(limit: number, since?: Date): Promise<LeaderboardRow[]> {
  const seats = await prisma.matchPlayer.findMany({
    where: {
      match: {
        status: 'FINISHED',
        hadBots: false,
        ...(since ? { finishedAt: { gte: since } } : {}),
      },
    },
    select: {
      userId: true,
      won: true,
      user: { select: { username: true, name: true, avatar: true } },
      match: { select: { finishedAt: true } },
    },
  });

  const byUser = new Map<string, LeaderboardRow>();
  for (const seat of seats) {
    const row = byUser.get(seat.userId) ?? {
      userId: seat.userId,
      name: displayName(seat.user),
      avatar: seat.user?.avatar ?? null,
      played: 0,
      won: 0,
      winRate: 0,
      lastPlayed: null as Date | null,
    };
    row.played += 1;
    if (seat.won) row.won += 1;
    row.winRate = Math.round((row.won / row.played) * 100);
    row.lastPlayed = newest(row.lastPlayed, seat.match.finishedAt);
    byUser.set(seat.userId, row);
  }

  return [...byUser.values()]
    .sort((a, b) => b.won - a.won || b.winRate - a.winRate || b.played - a.played)
    .slice(0, limit);
}

export interface XpRow {
  userId: string;
  name: string;
  avatar: string | null;
  level: number;
  totalXp: number;
  band: string;
  played: number;
  /** When they last finished a match — the only activity the app records. */
  lastPlayed: Date | null;
}

/**
 * Who is furthest along, across everyone who has played here.
 *
 * Ranked on XP rather than wins, because XP is the one number every game will
 * feed — a board built on wins would have to be rebuilt the moment a second
 * game arrives. Matches against bots are included at the half rate they already
 * pay, so a player's position agrees with the level on their own card.
 */
export async function getXpLeaderboard(limit = 5): Promise<XpRow[]> {
  return safely('Reading the XP board', [], () => xpLeaderboard(limit));
}

async function xpLeaderboard(limit: number): Promise<XpRow[]> {
  // Every finished seat in one read, then grouped in memory: a level counts
  // feats and challenges off the trick log, so there is no aggregate that could
  // answer this in SQL. Fine at this size, and the alternative is one full
  // stats query per player.
  const seats = await prisma.matchPlayer.findMany({
    where: { match: { status: 'FINISHED' } },
    select: { ...MATCH_SELECT, userId: true, user: { select: { username: true, name: true, avatar: true } } },
  });

  const byUser = new Map<string, { name: string; avatar: string | null; matches: PlayedMatch[] }>();
  for (const seat of seats) {
    const player = byUser.get(seat.userId) ?? {
      name: displayName(seat.user),
      avatar: seat.user?.avatar ?? null,
      matches: [],
    };
    player.matches.push(toPlayedMatch(seat.userId, seat));
    byUser.set(seat.userId, player);
  }

  return [...byUser.entries()]
    .map(([userId, player]) => {
      const level = levelFromXp(totalXpFor(player.matches));
      return {
        userId,
        name: player.name,
        avatar: player.avatar,
        level: level.level,
        totalXp: level.totalXp,
        band: bandForLevel(level.level).name,
        played: player.matches.length,
        lastPlayed: player.matches.reduce<Date | null>(
          (latest, match) => newest(latest, match.finishedAt),
          null,
        ),
      };
    })
    .sort((a, b) => b.totalXp - a.totalXp || b.played - a.played)
    .slice(0, limit);
}
