import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasNews,
  newsSince,
  seenFrom,
  snapshotFrom,
  takeSnapshot,
  type ProgressSnapshot,
} from '@/lib/progress-feed';
import type { ChallengeState } from '@/lib/challenges';
import type { FeatState } from '@/lib/feats';
import type { Level, MilestoneState } from '@/lib/progression';

const level = (n: number, xp = 0): Level => ({ level: n, into: 0, span: 80, totalXp: xp });

const milestone = (id: string, cleared: number): MilestoneState => ({
  id,
  name: id === 'wins' ? 'Sharpshooter' : 'Table Regular',
  badge: '🎯',
  unit: 'matches won',
  count: 12,
  cleared,
  label: 'x',
  target: 50,
  floor: 10,
  xpEarned: 0,
});

const feat = (id: string, earned: boolean): FeatState => ({
  id,
  name: 'Clean Sheet',
  description: 'Win without losing a trick.',
  badge: '🧹',
  xp: 300,
  achieved: () => earned,
  earned,
});

const challenge = (id: string, done: boolean): ChallengeState => ({
  id,
  name: 'On a Run',
  description: 'Win three matches this week.',
  target: 3,
  xp: 120,
  count: () => 0,
  progress: done ? 3 : 1,
  done,
});

describe('snapshotFrom', () => {
  it('lists one key per tier cleared, so the next tier reads as new', () => {
    const snapshot = snapshotFrom(level(4), [milestone('wins', 2)], [], [], 100);
    expect(snapshot.unlocks.map((unlock) => unlock.key)).toEqual([
      'tier:wins:1',
      'tier:wins:2',
    ]);
    expect(snapshot.unlocks[1].label).toBe('Sharpshooter II');
  });

  it('leaves out what has not been earned', () => {
    const snapshot = snapshotFrom(
      level(1),
      [milestone('wins', 0)],
      [feat('clean-sheet', false)],
      [challenge('win-three', false)],
      100,
    );
    expect(snapshot.unlocks).toEqual([]);
  });

  it('keys a challenge by week, so the same one coming round again counts', () => {
    const thisWeek = snapshotFrom(level(1), [], [], [challenge('win-three', true)], 100);
    const nextWeek = snapshotFrom(level(1), [], [], [challenge('win-three', true)], 101);
    expect(thisWeek.unlocks[0].key).not.toBe(nextWeek.unlocks[0].key);
  });
});

describe('newsSince', () => {
  const before = snapshotFrom(level(4), [milestone('wins', 1)], [], [], 100);
  const after = snapshotFrom(
    level(6),
    [milestone('wins', 2)],
    [feat('clean-sheet', true)],
    [challenge('win-three', true)],
    100,
  );

  it('reports only what is new, not the whole history', () => {
    const news = newsSince(seenFrom(before), after);
    expect(news.unlocks.map((unlock) => unlock.key)).toEqual([
      'tier:wins:2',
      'feat:clean-sheet',
      'challenge:100:win-three',
    ]);
  });

  it('counts levels gained rather than just the new level', () => {
    expect(newsSince(seenFrom(before), after)).toMatchObject({ levelsGained: 2, level: 6 });
  });

  it('is silent when nothing has changed', () => {
    const news = newsSince(seenFrom(after), after);
    expect(hasNews(news)).toBe(false);
    expect(news.levelsGained).toBe(0);
  });

  it('never reports negative levels if a snapshot somehow goes backwards', () => {
    const news = newsSince(seenFrom(after), before);
    expect(news.levelsGained).toBe(0);
  });

  it('treats a level gain with no unlocks as news in its own right', () => {
    const levelledOnly: ProgressSnapshot = { ...before, level: 5 };
    expect(hasNews(newsSince(seenFrom(before), levelledOnly))).toBe(true);
  });
});

describe('takeSnapshot', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
      },
    });
  });

  const at = (level: number, milestones: MilestoneState[] = []) =>
    snapshotFrom({ level, into: 0, span: 80, totalXp: level * 100 }, milestones, [], [], 100);

  it('says nothing on a first look, but remembers what it saw', () => {
    expect(takeSnapshot(at(6, [milestone('wins', 2)]))).toBeNull();
    // Now that it has a baseline, the next change is news.
    const news = takeSnapshot(at(7, [milestone('wins', 3)]));
    expect(news).toMatchObject({ levelsGained: 1, level: 7 });
    expect(news?.unlocks.map((unlock) => unlock.key)).toEqual(['tier:wins:3']);
  });

  it('says nothing when nothing has changed', () => {
    takeSnapshot(at(6));
    expect(takeSnapshot(at(6))).toBeNull();
  });

  it('ignores a snapshot that went backwards, and keeps the old baseline', () => {
    takeSnapshot(at(9, [milestone('wins', 2)]));
    // A failed read blanks the record; saving it would re-announce everything.
    expect(takeSnapshot(at(1, []))).toBeNull();
    // The baseline survived, so a real snapshot is still only news for what is new.
    expect(takeSnapshot(at(9, [milestone('wins', 2)]))).toBeNull();
    expect(takeSnapshot(at(10, [milestone('wins', 2)]))).toMatchObject({ levelsGained: 1 });
  });
});
