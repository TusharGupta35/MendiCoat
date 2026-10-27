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

describe('describeMatch for the other games', () => {
  const party = (gameId: string, wonBy: string[]): ActivityMatch =>
    match({
      gameId,
      winnerTeam: null,
      seats: ['Kabir', 'Neha', 'Rohan'].map((name, index) => ({
        userId: `u${index + 1}`,
        name,
        team: 'SOLO',
        won: wonBy.includes(name),
      })),
    });

  it('names the winner of an Impostor game', () => {
    expect(describeMatch(party('IMPOSTOR', ['Neha']), 'u1')).toMatchObject({
      kind: 'win',
      headline: 'Neha won Impostor',
      detail: '3 players',
      mine: true,
    });
  });

  it('names joint winners of Doodle Dhamaka, you first', () => {
    expect(describeMatch(party('DOODLE_DHAMAKA', ['Kabir', 'Rohan']), 'u3')?.headline).toBe(
      'You & Kabir won Doodle Dhamaka',
    );
  });

  it('names the table when nobody scored', () => {
    expect(describeMatch(party('IMPOSTOR', []), null)).toMatchObject({
      kind: 'draw',
      headline: 'Kabir, Neha & Rohan played Impostor',
    });
  });

  const tigdi = (made: boolean): ActivityMatch =>
    match({
      gameId: 'TEEN_KI_TIGDI',
      winnerTeam: null,
      detail: { bid: 150, made, points: { BIDDER: made ? 160 : 120, OPPONENT: made ? 90 : 130 } },
      seats: [
        { userId: 'u1', name: 'Kabir', team: 'BIDDER', won: made },
        { userId: 'u2', name: 'Neha', team: 'BIDDER', won: made },
        { userId: 'u3', name: 'Rohan', team: 'OPPONENT', won: !made },
      ],
    });

  it('writes a Teen Ki Tigdi bid that was made', () => {
    expect(describeMatch(tigdi(true), null)).toMatchObject({
      headline: 'Kabir & Neha made a 150 bid',
      detail: '160–90 in Teen Ki Tigdi',
    });
  });

  it('writes a Teen Ki Tigdi bid that went down, and stands in for a side of bots', () => {
    expect(describeMatch(tigdi(false), 'u1')?.headline).toBe('You & Neha went down on a 150 bid');
    const botBid = { ...tigdi(false), seats: tigdi(false).seats.filter((seat) => seat.team === 'OPPONENT') };
    expect(describeMatch(botBid, null)?.headline).toBe('the bots went down on a 150 bid');
  });
});
