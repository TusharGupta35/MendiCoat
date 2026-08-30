import { describe, expect, it } from 'vitest';
import {
  MILESTONES,
  bandForLevel,
  levelFromXp,
  matchXp,
  milestoneState,
  milestoneStates,
  seriesXpEarned,
  tierXp,
  totalXpFor,
  wasMvp,
  xpToClear,
} from '@/lib/progression';
import type { PlayedMatch, PlayedTrick } from '@/lib/stats-core';

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
    // 4 played + 12 won + 2 team tens x 2. No trick log, so no 10 is credited
    // to this seat personally and no MVP is named.
    expect(matchXp(match({ winnerTeam: 'A', capturedTensA: 2 }))).toBe(20);
  });

  it('pays again for the 10s this player took, not just the team', () => {
    const tricks = [...taken(0, 3, 2), ...taken(1, 4)];
    const worker = matchXp(match({ winnerTeam: 'A', capturedTensA: 2, seat: 0, tricks }));
    const passenger = matchXp(match({ winnerTeam: 'A', capturedTensA: 2, seat: 2, tricks }));
    // Both are on the winning team and both bank the team's 10s; only one of
    // them actually took them, and is MVP for it.
    expect(worker).toBeGreaterThan(passenger);
  });

  it('pays less for a loss than a win', () => {
    const lost = matchXp(match({ winnerTeam: 'B', capturedTensA: 2 }));
    const won = matchXp(match({ winnerTeam: 'A', capturedTensA: 2 }));
    expect(lost).toBeLessThan(won);
    expect(lost).toBe(8);
  });

  it('adds a coat bonus on top of the tens', () => {
    // 4 + 12 + 4 team tens x 2 + 10 coat
    expect(matchXp(match({ winnerTeam: 'A', capturedTensA: 4, capturedTensB: 0 }))).toBe(34);
  });

  it('costs nothing to be coated beyond the lost tens', () => {
    expect(matchXp(match({ winnerTeam: 'B', capturedTensA: 0, capturedTensB: 4 }))).toBe(4);
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

/**
 * Tricks taken by a seat, `tens` of them carrying a 10. Trick numbers only have
 * to be distinct, so they are counted off a running clock like the matches.
 */
let trickClock = 0;
function taken(seat: number, count: number, tens = 0): PlayedTrick[] {
  return Array.from({ length: count }, (_, i) => {
    trickClock += 1;
    const hasTen = i < tens;
    return {
      trickNumber: trickClock,
      seats: [0, 1, 2, 3],
      cards: [hasTen ? '10H' : '9H', '3H', '4H', '5H'],
      leadSuit: 'HEARTS',
      winnerSeat: seat,
      winnerTeam: seat % 2 === 0 ? 'A' : 'B',
      tensWon: hasTen ? 1 : 0,
      fixedTrump: false,
    };
  });
}

/** The three other seats at the table, as humans this player can be ranked against. */
const opponents: PlayedMatch['others'] = [1, 2, 3].map((seat) => ({
  userId: `u${seat}`,
  name: `Player ${seat}`,
  avatar: null,
  seat,
  team: seat % 2 === 0 ? 'A' : 'B',
}));

describe('wasMvp', () => {
  it('names the seat that took the most, weighting a ten above a trick', () => {
    const played = match({ seat: 0, tricks: [...taken(0, 2, 2), ...taken(1, 5)] });
    expect(wasMvp(played)).toBe(true);
  });

  it('is nobody in a match with no trick log', () => {
    expect(wasMvp(match({ tricks: [] }))).toBe(false);
  });
});

describe('matchXp, MVP', () => {
  const carried = { seat: 0, tricks: [...taken(0, 8, 3), ...taken(1, 5)] };

  it('pays the MVP of a won match on top of the rest', () => {
    const mvp = matchXp(match({ winnerTeam: 'A', ...carried }));
    // The same match with no trick log at all: no MVP, and no 10s credited.
    const plain = matchXp(match({ winnerTeam: 'A' }));
    expect(mvp - plain).toBe(5 + 3 * 2);
  });

  it('pays no MVP bonus for playing best on the losing side', () => {
    // 4 played, nothing for the loss, 2 team tens x 2, 3 tens taken x 2 — and
    // no MVP bonus on top, though this seat was the best at the table.
    expect(matchXp(match({ winnerTeam: 'B', ...carried }))).toBe(4 + 4 + 6);
    // The same match won pays the win and the bonus as well.
    expect(matchXp(match({ winnerTeam: 'A', ...carried }))).toBe(4 + 4 + 6 + 12 + 5);
  });

  it('pays the bot rate for the same match against bots', () => {
    const humans = matchXp(match({ winnerTeam: 'A', ...carried }));
    const withBots = matchXp(match({ winnerTeam: 'A', hadBots: true, ...carried }));
    expect(withBots).toBe(Math.round(humans / 2));
    // Halved, but never nothing: the bots play the full strategy now.
    expect(withBots).toBeGreaterThan(0);
  });
});

describe('seriesXpEarned', () => {
  /** One match of a series this player led on the trick log. */
  const led = (overrides: Partial<PlayedMatch> = {}) =>
    match({
      seriesId: 's1',
      seriesTarget: 2,
      others: opponents,
      seat: 0,
      tricks: [...taken(0, 7, 3), ...taken(1, 6, 1)],
      ...overrides,
    });

  it('pays by the matches it took to settle, not the length declared', () => {
    // Best of 7 swept 4-0 pays for the four that were played, not the seven it
    // could have run to — otherwise the long targets would be free XP.
    const sweep = Array.from({ length: 4 }, () => led({ seriesTarget: 4 }));
    expect(seriesXpEarned(sweep)).toBe(32);
  });

  it('pays a longer series more than a short one', () => {
    const short = seriesXpEarned([led(), led()]);
    const long = seriesXpEarned([led(), led({ winnerTeam: 'B' }), led()]);
    expect(long).toBeGreaterThan(short);
  });

  it('pays nothing for a series still being played', () => {
    expect(seriesXpEarned([led()])).toBe(0);
  });

  it('pays nothing to the best player on the losing side', () => {
    const lost = [led({ winnerTeam: 'B' }), led({ winnerTeam: 'B' })];
    expect(seriesXpEarned(lost)).toBe(0);
  });

  it('pays nothing when another seat led the series', () => {
    const outplayed = { tricks: [...taken(0, 2), ...taken(1, 8, 4)] };
    expect(seriesXpEarned([led(outplayed), led(outplayed)])).toBe(0);
  });

  it('ignores matches played on after the series was already decided', () => {
    const decided = [led(), led(), led(), led()];
    expect(seriesXpEarned(decided)).toBe(16);
  });

  it('pays the bot rate for a series with bots in it', () => {
    const withBots = seriesXpEarned([led({ hadBots: true }), led()]);
    expect(withBots).toBe(Math.round(seriesXpEarned([led(), led()]) / 2));
    expect(withBots).toBeGreaterThan(0);
  });

  it('ignores matches that belong to no series', () => {
    expect(seriesXpEarned([match({ winnerTeam: 'A' }), match({ winnerTeam: 'A' })])).toBe(0);
  });
});
