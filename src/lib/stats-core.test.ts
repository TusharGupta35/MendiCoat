import { describe, expect, it } from 'vitest';
import {
  careerStats,
  cutterOf,
  partnerRecords,
  type PlayedMatch,
  type PlayedTrick,
} from '@/lib/stats-core';

let clock = 0;
function match(overrides: Partial<PlayedMatch> = {}): PlayedMatch {
  clock += 1000;
  return {
    id: `m${clock}`,
    finishedAt: new Date(clock),
    winnerTeam: 'A',
    capturedTensA: 3,
    capturedTensB: 1,
    handsWonA: 7,
    handsWonB: 6,
    hadBots: false,
    team: 'A',
    seat: 0,
    others: [],
    tricks: [],
    ...overrides,
  };
}

const partner = (userId: string, name: string) => ({ userId, name, seat: 2, team: 'A' as const });

describe('careerStats', () => {
  it('counts wins, losses and draws separately', () => {
    const stats = careerStats([
      match({ winnerTeam: 'A', team: 'A' }),
      match({ winnerTeam: 'B', team: 'A' }),
      match({ winnerTeam: 'DRAW', team: 'A' }),
    ]);
    expect(stats).toMatchObject({ played: 3, won: 1, lost: 1, drawn: 1, winRate: 33 });
  });

  it('reports a zero win rate rather than dividing by nothing', () => {
    expect(careerStats([]).winRate).toBe(0);
  });

  it('sums the tens its own team captured, whichever side that was', () => {
    const stats = careerStats([
      match({ team: 'A', capturedTensA: 3, capturedTensB: 1 }),
      match({ team: 'B', capturedTensA: 1, capturedTensB: 3 }),
    ]);
    expect(stats.tensCaptured).toBe(6);
  });

  it('separates coats dealt from coats taken', () => {
    const stats = careerStats([
      match({ team: 'A', capturedTensA: 4, capturedTensB: 0 }),
      match({ team: 'A', capturedTensA: 0, capturedTensB: 4, winnerTeam: 'B' }),
    ]);
    expect(stats.coatsDealt).toBe(1);
    expect(stats.coatsTaken).toBe(1);
  });

  it('measures the current streak from the most recent match', () => {
    // Oldest to newest: W W L W W W
    const stats = careerStats([
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'B' }),
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'A' }),
    ]);
    expect(stats.currentStreak).toBe(3);
    expect(stats.bestStreak).toBe(3);
  });

  it('keeps the best streak even after it is broken', () => {
    // Oldest to newest: W W W W L W
    const stats = careerStats([
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'B' }),
      match({ winnerTeam: 'A' }),
    ]);
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(4);
  });

  it('treats a draw as breaking a streak', () => {
    const stats = careerStats([
      match({ winnerTeam: 'A' }),
      match({ winnerTeam: 'DRAW' }),
    ]);
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(1);
  });
});

describe('partnerRecords', () => {
  it('groups by the partner on the same team and ranks by matches played', () => {
    const records = partnerRecords([
      match({ winnerTeam: 'A', team: 'A', others: [partner('u2', 'Priya')] }),
      match({ winnerTeam: 'B', team: 'A', others: [partner('u2', 'Priya')] }),
      match({ winnerTeam: 'A', team: 'A', others: [partner('u3', 'Arjun')] }),
    ]);
    expect(records).toEqual([
      { userId: 'u2', name: 'Priya', played: 2, won: 1, winRate: 50 },
      { userId: 'u3', name: 'Arjun', played: 1, won: 1, winRate: 100 },
    ]);
  });

  it('ignores opponents, counting only the player on your own team', () => {
    const records = partnerRecords([
      match({ team: 'A', others: [{ userId: 'u2', name: 'Rival', seat: 1, team: 'B' }] }),
    ]);
    expect(records).toEqual([]);
  });
});

describe('cutterOf', () => {
  const trick = (overrides: Partial<PlayedTrick> = {}): PlayedTrick => ({
    trickNumber: 1,
    seats: [0, 1, 2, 3],
    cards: ['AS', '3S', '2H', 'KS'],
    leadSuit: 'SPADES',
    winnerSeat: 2,
    winnerTeam: 'A',
    tensWon: 0,
    fixedTrump: true,
    ...overrides,
  });

  it('finds the first player to go off-suit', () => {
    expect(cutterOf(trick())).toEqual({ seat: 2, card: '2H' });
  });

  it('returns nothing on a trick where trump was not fixed', () => {
    expect(cutterOf(trick({ fixedTrump: false }))).toBeNull();
  });

  it('does not mistake a same-suit card for a cut', () => {
    // Clubs led, and every card follows: no cut to find.
    expect(
      cutterOf(trick({ leadSuit: 'CLUBS', cards: ['AC', '3C', '2C', 'KC'] })),
    ).toBeNull();
  });
});
