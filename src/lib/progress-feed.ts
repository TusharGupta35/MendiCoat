import type { ChallengeState } from '@/lib/challenges';
import type { FeatState } from '@/lib/feats';
import type { Level, MilestoneState } from '@/lib/progression';

/**
 * Turning progress into something that can be announced.
 *
 * A snapshot lists everything a player has unlocked, each under a stable key.
 * The browser remembers the last snapshot it showed; anything whose key is new
 * is something that happened since, and gets celebrated once.
 *
 * Keyed rather than counted because counts cannot tell you *what* changed, and
 * "you unlocked something" is a worse message than "Sharpshooter II".
 */

export interface Unlock {
  key: string;
  kind: 'tier' | 'feat' | 'challenge';
  label: string;
  detail: string;
  badge: string;
  xp: number;
}

export interface ProgressSnapshot {
  level: number;
  totalXp: number;
  unlocks: Unlock[];
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function snapshotFrom(
  level: Level,
  milestones: MilestoneState[],
  feats: FeatState[],
  challenges: ChallengeState[],
  week: number,
): ProgressSnapshot {
  const unlocks: Unlock[] = [];

  for (const milestone of milestones) {
    // One entry per tier cleared, so clearing the next one reads as new.
    for (let tier = 1; tier <= milestone.cleared; tier += 1) {
      unlocks.push({
        key: `tier:${milestone.id}:${tier}`,
        kind: 'tier',
        label: `${milestone.name} ${NUMERALS[tier - 1] ?? tier}`,
        detail: milestone.unit,
        badge: milestone.badge,
        xp: 0,
      });
    }
  }

  for (const feat of feats) {
    if (!feat.earned) continue;
    unlocks.push({
      key: `feat:${feat.id}`,
      kind: 'feat',
      label: feat.name,
      detail: feat.description,
      badge: feat.badge,
      xp: feat.xp,
    });
  }

  for (const challenge of challenges) {
    if (!challenge.done) continue;
    // Keyed by week, so the same challenge coming round again still counts.
    unlocks.push({
      key: `challenge:${week}:${challenge.id}`,
      kind: 'challenge',
      label: challenge.name,
      detail: challenge.description,
      badge: '🗓️',
      xp: challenge.xp,
    });
  }

  return { level: level.level, totalXp: level.totalXp, unlocks };
}

/** What the browser remembers of the last snapshot it showed. */
export interface SeenProgress {
  level: number;
  keys: string[];
}

export interface ProgressNews {
  levelsGained: number;
  level: number;
  unlocks: Unlock[];
}

export function newsSince(seen: SeenProgress, snapshot: ProgressSnapshot): ProgressNews {
  const known = new Set(seen.keys);
  return {
    levelsGained: Math.max(0, snapshot.level - seen.level),
    level: snapshot.level,
    unlocks: snapshot.unlocks.filter((unlock) => !known.has(unlock.key)),
  };
}

export const hasNews = (news: ProgressNews) => news.levelsGained > 0 || news.unlocks.length > 0;

export const seenFrom = (snapshot: ProgressSnapshot): SeenProgress => ({
  level: snapshot.level,
  keys: snapshot.unlocks.map((unlock) => unlock.key),
});

const STORAGE_KEY = 'mendi:progress-seen';

/** Null when nothing has been stored yet — a first visit must not celebrate a whole history. */
function readSeen(): SeenProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SeenProgress>;
    if (typeof parsed?.level !== 'number' || !Array.isArray(parsed.keys)) return null;
    return { level: parsed.level, keys: parsed.keys.filter((key) => typeof key === 'string') };
  } catch {
    // Private windows and cleared site data both land here; treat as first visit.
    return null;
  }
}

function writeSeen(snapshot: ProgressSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seenFrom(snapshot)));
  } catch {
    // Storage being unavailable only costs the celebration, so carry on.
  }
}

/**
 * Compares a snapshot against what this browser last saw, records it, and
 * returns anything worth announcing.
 *
 * A level cannot fall — XP only accumulates — so a snapshot that reports a
 * lower one is a failed read dressed up as a blank record. Saving it would
 * wipe what we knew and re-announce the player's whole history later, so it is
 * ignored instead.
 */
export function takeSnapshot(snapshot: ProgressSnapshot): ProgressNews | null {
  const seen = readSeen();
  if (seen && snapshot.level < seen.level) return null;

  writeSeen(snapshot);
  // Nothing stored means a browser that has never looked; record it quietly
  // rather than celebrating everything earned before today.
  if (!seen) return null;

  const news = newsSince(seen, snapshot);
  return hasNews(news) ? news : null;
}
