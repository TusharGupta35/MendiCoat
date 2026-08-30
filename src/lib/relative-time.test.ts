import { describe, expect, it } from 'vitest';
import { timeSince } from '@/lib/relative-time';

const now = new Date('2026-08-29T20:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('timeSince', () => {
  it('says nothing at all for a player who has never finished a match', () => {
    expect(timeSince(null, now)).toBeNull();
  });

  it('reads as now for anything inside the last minute', () => {
    expect(timeSince(ago(20 * 1000), now)).toBe('just now');
  });

  it('does not go backwards when a clock is skewed the wrong way', () => {
    expect(timeSince(new Date(now.getTime() + 5000), now)).toBe('just now');
  });

  it('counts minutes for the first hour', () => {
    expect(timeSince(ago(12 * MINUTE), now)).toBe('12m ago');
  });

  it('counts hours and minutes for the first day', () => {
    expect(timeSince(ago(3 * HOUR + 20 * MINUTE), now)).toBe('3h 20m ago');
  });

  it('drops the smaller unit when it is zero', () => {
    expect(timeSince(ago(3 * HOUR), now)).toBe('3h ago');
    expect(timeSince(ago(4 * DAY), now)).toBe('4d ago');
  });

  it('counts days and hours after that', () => {
    expect(timeSince(ago(4 * DAY + 3 * HOUR), now)).toBe('4d 3h ago');
  });

  it('stops caring about hours after a month, and days after a year', () => {
    expect(timeSince(ago(70 * DAY), now)).toBe('2mo ago');
    expect(timeSince(ago(400 * DAY), now)).toBe('1y ago');
  });

  it('never uses more than two units, however long ago it was', () => {
    for (const elapsed of [90 * MINUTE, 26 * HOUR, 9 * DAY, 200 * DAY, 800 * DAY]) {
      const label = timeSince(ago(elapsed), now)!;
      expect(label.match(/\d+[a-z]+/g)!.length).toBeLessThanOrEqual(2);
      expect(label.endsWith(' ago')).toBe(true);
    }
  });
});
