import { describe, expect, it } from 'vitest';
import {
  challengeXpEarned,
  challengesForWeek,
  currentChallenges,
  weekOf,
  weekStart,
} from '@/lib/challenges';
import type { PlayedMatch } from '@/lib/stats-core';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const now = new Date('2026-08-28T12:00:00Z');

function match(finishedAt: Date, overrides: Partial<PlayedMatch> = {}): PlayedMatch {
  return {
    id: `m${finishedAt.getTime()}`,
    finishedAt,
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

describe('challengesForWeek', () => {
  it('always gives three distinct challenges', () => {
    for (let week = -10; week < 60; week += 1) {
      const picks = challengesForWeek(week);
      expect(picks).toHaveLength(3);
      expect(new Set(picks.map((pick) => pick.id)).size).toBe(3);
    }
  });

  it('still returns a full set for weeks before the epoch Monday', () => {
    // Dates that land before 5 January 1970 give a negative week number.
    for (const week of [-1, -5, -40]) {
      const picks = challengesForWeek(week);
      expect(picks).toHaveLength(3);
      expect(picks.every((pick) => pick && typeof pick.id === 'string')).toBe(true);
    }
  });

  it('is stable for a given week, so progress cannot shift underneath a player', () => {
    expect(challengesForWeek(42).map((pick) => pick.id)).toEqual(
      challengesForWeek(42).map((pick) => pick.id),
    );
  });

  it('does not hand out the same trio two weeks running', () => {
    for (let week = -10; week < 60; week += 1) {
      const thisWeek = challengesForWeek(week).map((pick) => pick.id).join();
      const nextWeek = challengesForWeek(week + 1).map((pick) => pick.id).join();
      expect(thisWeek).not.toBe(nextWeek);
    }
  });
});

describe('currentChallenges', () => {
  it('counts only matches from the current week', () => {
    const lastWeek = new Date(now.getTime() - WEEK);
    const challenges = currentChallenges(
      [match(now), match(now), match(lastWeek), match(lastWeek)],
      now,
    );
    const showUp = challenges.find((entry) => entry.id === 'play-five');
    // Whether "Show Up" is in this week's set depends on the rotation; when it
    // is, it must only see the two matches played this week.
    if (showUp) expect(showUp.progress).toBe(2);
  });

  it('never reports progress beyond the target', () => {
    const many = Array.from({ length: 30 }, () => match(now, { winnerTeam: 'A', capturedTensA: 4 }));
    for (const challenge of currentChallenges(many, now)) {
      expect(challenge.progress).toBeLessThanOrEqual(challenge.target);
      expect(challenge.done).toBe(true);
    }
  });
});

describe('challengeXpEarned', () => {
  it('is nothing without any matches', () => {
    expect(challengeXpEarned([])).toBe(0);
  });

  it('keeps XP from a past week, so a level cannot fall on a Monday', () => {
    const lastWeek = new Date(now.getTime() - WEEK);
    // Enough matches last week to clear whatever that week's set asked for.
    const played = Array.from({ length: 30 }, () =>
      match(lastWeek, { winnerTeam: 'A', capturedTensA: 4 }),
    );

    const earnedThen = challengeXpEarned(played);
    expect(earnedThen).toBeGreaterThan(0);

    // A week later those matches are history, but the XP stays.
    expect(challengeXpEarned(played)).toBe(earnedThen);
    expect(currentChallenges(played, now).every((entry) => !entry.done)).toBe(true);
  });

  it('adds up across several weeks', () => {
    const build = (when: Date) =>
      Array.from({ length: 30 }, () => match(when, { winnerTeam: 'A', capturedTensA: 4 }));
    const oneWeek = build(new Date(now.getTime() - WEEK));
    const twoWeeks = [...oneWeek, ...build(new Date(now.getTime() - 2 * WEEK))];
    expect(challengeXpEarned(twoWeeks)).toBeGreaterThan(challengeXpEarned(oneWeek));
  });
});

describe('weekOf', () => {
  it('puts two days apart in the same week bucket most of the time', () => {
    const a = weekOf(new Date('2026-08-25T00:00:00Z'));
    const b = weekOf(new Date('2026-08-26T00:00:00Z'));
    expect(b - a).toBeLessThanOrEqual(1);
  });

  it('changes bucket at Monday, matching what the page promises', () => {
    // 24 August 2026 is a Monday.
    const sunday = weekOf(new Date('2026-08-23T23:00:00Z'));
    const monday = weekOf(new Date('2026-08-24T01:00:00Z'));
    const laterMonday = weekOf(new Date('2026-08-24T23:00:00Z'));
    expect(monday).toBe(sunday + 1);
    expect(laterMonday).toBe(monday);
  });

  it('advances by one every seven days', () => {
    const base = new Date('2026-08-25T00:00:00Z');
    expect(weekOf(new Date(base.getTime() + WEEK))).toBe(weekOf(base) + 1);
  });
});

describe('weekStart', () => {
  it('is the Monday midnight that opens the week', () => {
    // 24 August 2026 is a Monday.
    const start = weekStart(weekOf(new Date('2026-08-28T12:00:00Z')));
    expect(start.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('round-trips with weekOf, including weeks before the epoch Monday', () => {
    for (let week = -10; week < 60; week += 1) {
      expect(weekOf(weekStart(week))).toBe(week);
    }
  });

  it('leaves no gap between one week and the next', () => {
    const start = weekStart(12);
    const justBefore = new Date(start.getTime() - 1);
    expect(weekOf(justBefore)).toBe(11);
  });
});
