import { describe, expect, it } from 'vitest';
import { describeMatch, joinNames, type ActivityMatch } from '@/lib/activity-core';

const match = (over: Partial<ActivityMatch> = {}): ActivityMatch => ({
  id: 'm1',
  finishedAt: new Date('2026-09-13T10:00:00Z'),
  winnerTeam: 'A',
  capturedTensA: 3,
  capturedTensB: 1,
  seats: [
    { userId: 'u1', name: 'Kabir', team: 'A' },
    { userId: 'u2', name: 'Neha', team: 'A' },
    { userId: 'u3', name: 'Rohan', team: 'B' },
    { userId: 'u4', name: 'Aman', team: 'B' },
  ],
  ...over,
});

describe('joinNames', () => {
  it('joins a pair with an ampersand', () => {
    expect(joinNames(['Kabir', 'Neha'])).toBe('Kabir & Neha');
  });

  it('commas all but the last', () => {
    expect(joinNames(['Kabir', 'Neha', 'Rohan'])).toBe('Kabir, Neha & Rohan');
  });

  it('leaves one name alone', () => {
    expect(joinNames(['Kabir'])).toBe('Kabir');
  });
});

describe('describeMatch', () => {
  it('writes an ordinary win with the 10s score', () => {
    const entry = describeMatch(match(), null);
    expect(entry).toMatchObject({
      kind: 'win',
      headline: 'Kabir & Neha beat Rohan & Aman',
      detail: '3–1 on 10s',
      mine: false,
    });
  });

  it('calls all four 10s a coat', () => {
    const entry = describeMatch(match({ capturedTensA: 4, capturedTensB: 0 }), null);
    expect(entry).toMatchObject({
      kind: 'coat',
      headline: 'Kabir & Neha dealt a coat to Rohan & Aman',
    });
  });

  it('names the losing team when B wins', () => {
    const entry = describeMatch(match({ winnerTeam: 'B', capturedTensA: 1, capturedTensB: 3 }), null);
    expect(entry?.headline).toBe('Rohan & Aman beat Kabir & Neha');
    expect(entry?.detail).toBe('3–1 on 10s');
  });

  it('writes a draw without a score', () => {
    const entry = describeMatch(match({ winnerTeam: 'DRAW' }), null);
    expect(entry).toMatchObject({ kind: 'draw', detail: null });
    expect(entry?.headline).toBe('Kabir & Neha and Rohan & Aman drew');
  });

  it('calls the reader "You" and puts them first on their own side', () => {
    const entry = describeMatch(match(), 'u2');
    expect(entry?.headline).toBe('You & Kabir beat Rohan & Aman');
    expect(entry?.mine).toBe(true);
  });

  it('says "You" on the losing side too', () => {
    const entry = describeMatch(match(), 'u3');
    expect(entry?.headline).toBe('Kabir & Neha beat You & Aman');
    expect(entry?.mine).toBe(true);
  });

  // An unfinished match has no result to report, and must not be written as one.
  it('describes nothing for a match that never finished', () => {
    expect(describeMatch(match({ finishedAt: null }), null)).toBeNull();
    expect(describeMatch(match({ winnerTeam: null }), null)).toBeNull();
  });
});
