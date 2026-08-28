import { describe, expect, it } from 'vitest';
import { earnedTitles, titleLabel, titleLabelById } from '@/lib/titles';
import type { FeatState } from '@/lib/feats';
import type { MilestoneState } from '@/lib/progression';

const milestone = (id: string, cleared: number, label: string): MilestoneState => ({
  id,
  name: label.replace(/ [IVX]+$/, ''),
  badge: '🎯',
  unit: 'wins',
  count: 12,
  cleared,
  label,
  target: 50,
  floor: 10,
  xpEarned: 0,
});

const feat = (id: string, name: string, earned: boolean): FeatState => ({
  id,
  name,
  description: '',
  badge: '🧹',
  xp: 100,
  achieved: () => earned,
  earned,
});

describe('earnedTitles', () => {
  it('always offers the current rank', () => {
    expect(earnedTitles([], [], 'Sharp')).toEqual([
      { id: 'rank:Sharp', label: 'Sharp', from: 'rank' },
    ]);
  });

  it('offers only the highest tier of a milestone, not every one below it', () => {
    const titles = earnedTitles([milestone('wins', 3, 'Sharpshooter III')], [], 'Sharp');
    expect(titles.filter((title) => title.from === 'milestone')).toEqual([
      { id: 'tier:wins:3', label: 'Sharpshooter III', from: 'milestone' },
    ]);
  });

  it('leaves out milestones with no tier cleared', () => {
    const titles = earnedTitles([milestone('wins', 0, 'Sharpshooter')], [], 'Sharp');
    expect(titles.some((title) => title.from === 'milestone')).toBe(false);
  });

  it('offers earned feats and withholds the rest', () => {
    const titles = earnedTitles(
      [],
      [feat('clean-sheet', 'Clean Sheet', true), feat('low-cut', 'Low Blow', false)],
      'Sharp',
    );
    expect(titles.filter((title) => title.from === 'feat')).toEqual([
      { id: 'feat:clean-sheet', label: 'Clean Sheet', from: 'feat' },
    ]);
  });
});

describe('titleLabel', () => {
  const earned = earnedTitles([], [feat('clean-sheet', 'Clean Sheet', true)], 'Sharp');

  it('resolves a title the player has earned', () => {
    expect(titleLabel('feat:clean-sheet', earned)).toBe('Clean Sheet');
  });

  it('refuses one they have not', () => {
    expect(titleLabel('feat:low-cut', earned)).toBeNull();
  });

  it('is nothing when no title is worn', () => {
    expect(titleLabel(null, earned)).toBeNull();
  });
});

describe('titleLabelById', () => {
  it('reads a feat title from the definitions', () => {
    expect(titleLabelById('feat:clean-sheet')).toBe('Clean Sheet');
  });

  it('numbers a milestone tier', () => {
    expect(titleLabelById('tier:wins:2')).toBe('Sharpshooter II');
  });

  it('passes a rank straight through', () => {
    expect(titleLabelById('rank:Card Shark')).toBe('Card Shark');
  });

  it('is nothing for an unknown or malformed id', () => {
    expect(titleLabelById('feat:nope')).toBeNull();
    expect(titleLabelById('tier:wins:0')).toBeNull();
    expect(titleLabelById('nonsense')).toBeNull();
    expect(titleLabelById(null)).toBeNull();
  });
});
