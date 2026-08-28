import { challengeXpEarned } from '@/lib/challenges';
import { featXpEarned } from '@/lib/feats';
import {
  didWin,
  myTens,
  theirTens,
  wasDrawn,
  type PlayedMatch,
} from '@/lib/stats-core';

/**
 * Levels, XP and tiered milestones.
 *
 * The point of this layer is that it never runs out. Feats are one-shot and
 * finite; a milestone completing reveals its next tier, and every unlock pays
 * XP into a level curve that has no ceiling. All of it is derived from match
 * history, so nothing extra is stored.
 */

/** XP for one finished match. Matches against bots pay half, to stop farming. */
export function matchXp(match: PlayedMatch): number {
  let xp = 10; // Turning up.
  if (didWin(match)) xp += 25;
  else if (wasDrawn(match)) xp += 10;
  xp += myTens(match) * 5;
  if (myTens(match) === 4) xp += 40; // Coat.
  // Being coated costs nothing; losing badly is punishment enough.
  if (theirTens(match) === 4) xp += 0;
  return match.hadBots ? Math.round(xp / 2) : xp;
}

/**
 * XP needed to climb out of a given level. Grows by a fixed step, so early
 * levels come in a match or two and later ones take a run of good games.
 */
export function xpToClear(level: number): number {
  return 80 + (level - 1) * 30;
}

export interface Level {
  level: number;
  /** XP earned inside the current level, and what the level costs. */
  into: number;
  span: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): Level {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpToClear(level)) {
    remaining -= xpToClear(level);
    level += 1;
  }
  return { level, into: remaining, span: xpToClear(level), totalXp };
}

/** Rank is a band of levels rather than its own ladder, so the two agree. */
const BANDS: Array<{ name: string; from: number }> = [
  { name: 'Newcomer', from: 1 },
  { name: 'Regular', from: 5 },
  { name: 'Sharp', from: 10 },
  { name: 'Cutthroat', from: 20 },
  { name: 'Card Shark', from: 35 },
  { name: 'Table Boss', from: 50 },
];

export function bandForLevel(level: number): { name: string; nextAt: number | null } {
  let index = 0;
  for (let i = 0; i < BANDS.length; i += 1) if (level >= BANDS[i].from) index = i;
  const next = BANDS[index + 1];
  return { name: BANDS[index].name, nextAt: next ? next.from : null };
}

export interface Milestone {
  id: string;
  name: string;
  badge: string;
  /** What is being counted, phrased for the tier line: "matches won". */
  unit: string;
  tiers: number[];
  count: (matches: PlayedMatch[]) => number;
}

/** Roman numerals go far enough for any tier list this size. */
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** XP for clearing tier n, index 0 upward. Later tiers are worth the grind. */
export function tierXp(tierIndex: number): number {
  return [60, 150, 400, 800, 1400, 2200][tierIndex] ?? 3000;
}

export const MILESTONES: Milestone[] = [
  {
    id: 'wins',
    name: 'Sharpshooter',
    badge: '🎯',
    unit: 'matches won',
    tiers: [1, 10, 50, 150],
    count: (matches) => matches.filter(didWin).length,
  },
  {
    id: 'played',
    name: 'Table Regular',
    badge: '📅',
    unit: 'matches played',
    tiers: [5, 25, 100, 250],
    count: (matches) => matches.length,
  },
  {
    id: 'tens',
    name: 'Ten Hunter',
    badge: '🔟',
    unit: '10s captured',
    tiers: [20, 100, 400, 1000],
    count: (matches) => matches.reduce((total, match) => total + myTens(match), 0),
  },
  {
    id: 'coats',
    name: 'Coat Dealer',
    badge: '👑',
    unit: 'coats dealt',
    tiers: [1, 5, 20, 50],
    count: (matches) => matches.filter((match) => myTens(match) === 4).length,
  },
  {
    id: 'partner',
    name: 'Old Friends',
    badge: '🤝',
    unit: 'wins with one partner',
    tiers: [5, 25, 75],
    count: (matches) => {
      const byPartner = new Map<string, number>();
      for (const match of matches) {
        if (!didWin(match)) continue;
        const partner = match.others.find((other) => other.team === match.team);
        if (!partner) continue;
        byPartner.set(partner.userId, (byPartner.get(partner.userId) ?? 0) + 1);
      }
      return Math.max(0, ...byPartner.values());
    },
  },
];

export interface MilestoneState {
  id: string;
  name: string;
  badge: string;
  unit: string;
  /** Total count so far. */
  count: number;
  /** Tiers already cleared, and the label for where they are now. */
  cleared: number;
  label: string;
  /** The tier being worked on: null once every tier is cleared. */
  target: number | null;
  /** Where the current tier started, so a bar can fill from it. */
  floor: number;
  xpEarned: number;
}

export function milestoneState(milestone: Milestone, matches: PlayedMatch[]): MilestoneState {
  const count = milestone.count(matches);
  const cleared = milestone.tiers.filter((tier) => count >= tier).length;
  const target = cleared < milestone.tiers.length ? milestone.tiers[cleared] : null;
  let xpEarned = 0;
  for (let i = 0; i < cleared; i += 1) xpEarned += tierXp(i);

  return {
    id: milestone.id,
    name: milestone.name,
    badge: milestone.badge,
    unit: milestone.unit,
    count,
    cleared,
    // A milestone with no tiers left reads as maxed rather than as a next step.
    label: cleared === 0 ? milestone.name : `${milestone.name} ${NUMERALS[cleared - 1] ?? cleared}`,
    target,
    floor: cleared === 0 ? 0 : milestone.tiers[cleared - 1],
    xpEarned,
  };
}

export function milestoneStates(matches: PlayedMatch[]): MilestoneState[] {
  return MILESTONES.map((milestone) => milestoneState(milestone, matches));
}

/**
 * Everything a player has earned, from three places: the matches themselves,
 * the tiers and feats they unlocked, and the weekly challenges they completed.
 * Challenge XP is replayed over past weeks so a level never falls on a Monday.
 */
export function totalXpFor(matches: PlayedMatch[]): number {
  const fromMatches = matches.reduce((total, match) => total + matchXp(match), 0);
  const fromTiers = milestoneStates(matches).reduce((total, state) => total + state.xpEarned, 0);
  return fromMatches + fromTiers + featXpEarned(matches) + challengeXpEarned(matches);
}
