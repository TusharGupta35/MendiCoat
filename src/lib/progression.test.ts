import { describe, expect, it } from 'vitest';
import {
  MILESTONES,
  bandForLevel,
  levelFromXp,
  matchXp,
  milestoneState,
  milestoneStates,
  tierXp,
  totalXpFor,
  xpToClear,
} from '@/lib/progression';
import type { PlayedMatch } from '@/lib/stats-core';

let clock = 0;
function match(overrides: Partial<PlayedMatch> = {}): PlayedMatch {
  clock += 1000;
  return {
    id: `m${clock}`,
    finishedAt: new Date(clock),
    winnerTeam: 'A',
    capturedTensA: 2,
    capturedTensB: 2,
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

describe('matchXp', () => {
  it('pays for turning up, winning, and each ten taken', () => {
    // 10 played + 25 won + 2 tens x 5
    expect(matchXp(match({ winnerTeam: 'A', capturedTensA: 2 }))).toBe(45);
  });

  it('pays less for a loss than a win', () => {
    const lost = matchXp(match({ winnerTeam: 'B', capturedTensA: 2 }));
    const won = matchXp(match({ winnerTeam: 'A', capturedTensA: 2 }));
    expect(lost).toBeLessThan(won);
    expect(lost).toBe(20);
  });

  it('adds a coat bonus on top of the tens', () => {
    // 10 + 25 + 4 tens x 5 + 40 coat
    expect(matchXp(match({ winnerTeam: 'A', capturedTensA: 4, capturedTensB: 0 }))).toBe(95);
  });

  it('costs nothing to be coated beyond the lost tens', () => {
    expect(matchXp(match({ winnerTeam: 'B', capturedTensA: 0, capturedTensB: 4 }))).toBe(10);
  });

  it('halves everything in a match against bots, so they cannot be farmed', () => {
    const real = matchXp(match({ winnerTeam: 'A', capturedTensA: 2 }));
    const bots = matchXp(match({ winnerTeam: 'A', capturedTensA: 2, hadBots: true }));
    expect(bots).toBe(Math.round(real / 2));
  });
});

describe('levelFromXp', () => {
  it('starts at level one with nothing earned', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, into: 0, span: 80 });
  });

  it('levels up exactly on the threshold', () => {
    expect(levelFromXp(xpToClear(1) - 1).level).toBe(1);
    expect(levelFromXp(xpToClear(1)).level).toBe(2);
  });

  it('carries the remainder into the new level', () => {
    const level = levelFromXp(xpToClear(1) + 25);
    expect(level).toMatchObject({ level: 2, into: 25, span: xpToClear(2) });
  });

  it('asks for more XP with every level, so it never stops', () => {
    expect(xpToClear(10)).toBeGreaterThan(xpToClear(1));
    expect(xpToClear(100)).toBeGreaterThan(xpToClear(10));
  });

  it('keeps climbing past the last named rank', () => {
    const high = levelFromXp(500_000);
    expect(high.level).toBeGreaterThan(50);
    expect(bandForLevel(high.level).name).toBe('Table Boss');
  });
});

describe('bandForLevel', () => {
  it('names the band and where the next one starts', () => {
    expect(bandForLevel(1)).toEqual({ name: 'Newcomer', nextAt: 5 });
    expect(bandForLevel(4).name).toBe('Newcomer');
    expect(bandForLevel(5).name).toBe('Regular');
  });

  it('has no band above the top one', () => {
    expect(bandForLevel(80)).toEqual({ name: 'Table Boss', nextAt: null });
  });
});

describe('milestones', () => {
  const wins = MILESTONES.find((entry) => entry.id === 'wins')!;

  it('shows the first tier as the target before anything is cleared', () => {
    const state = milestoneState(wins, []);
    expect(state).toMatchObject({ cleared: 0, target: 1, floor: 0, label: 'Sharpshooter', xpEarned: 0 });
  });

  it('reveals the next tier as soon as one is cleared', () => {
    const state = milestoneState(wins, [match({ winnerTeam: 'A' })]);
    expect(state).toMatchObject({ cleared: 1, target: 10, floor: 1, label: 'Sharpshooter I' });
    expect(state.xpEarned).toBe(tierXp(0));
  });

  it('pays for every tier cleared, not just the newest', () => {
    const matches = Array.from({ length: 12 }, () => match({ winnerTeam: 'A' }));
    const state = milestoneState(wins, matches);
    expect(state.cleared).toBe(2);
    expect(state.xpEarned).toBe(tierXp(0) + tierXp(1));
  });

  it('reports a maxed milestone with no target left', () => {
    const matches = Array.from({ length: 200 }, () => match({ winnerTeam: 'A' }));
    expect(milestoneState(wins, matches)).toMatchObject({ target: null, cleared: 4 });
  });

  it('counts the best single partnership rather than every win', () => {
    const partner = (userId: string) => [{ userId, name: userId, avatar: null, seat: 2, team: 'A' as const }];
    const spread = [
      match({ winnerTeam: 'A', others: partner('a') }),
      match({ winnerTeam: 'A', others: partner('a') }),
      match({ winnerTeam: 'A', others: partner('b') }),
    ];
    const state = milestoneStates(spread).find((entry) => entry.id === 'partner')!;
    expect(state.count).toBe(2);
  });
});

describe('totalXpFor', () => {
  it('is nothing for a player who has finished nothing', () => {
    expect(totalXpFor([])).toBe(0);
  });

  it('counts more than the matches alone, because tiers and feats pay too', () => {
    const played = [match({ winnerTeam: 'A' }), match({ winnerTeam: 'A' })];
    const justMatches = played.reduce((total, m) => total + matchXp(m), 0);
    // Two wins clears the first tier of both Sharpshooter and Table Regular.
    expect(totalXpFor(played)).toBeGreaterThan(justMatches);
  });

  it('only ever goes up as more matches are played', () => {
    const history: PlayedMatch[] = [];
    let last = 0;
    for (let i = 0; i < 12; i += 1) {
      history.push(match({ winnerTeam: i % 3 === 0 ? 'B' : 'A' }));
      const now = totalXpFor(history);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });
});
