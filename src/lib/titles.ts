import { FEATS, type FeatState } from '@/lib/feats';
import { MILESTONES, type MilestoneState } from '@/lib/progression';

/**
 * Titles a player can wear at the table.
 *
 * Every one has to be earned: they are derived from feats and milestone tiers
 * rather than stored, so a title can never be worn without the record behind
 * it, and the set grows on its own as milestones tier up.
 */

export interface Title {
  id: string;
  label: string;
  from: 'rank' | 'milestone' | 'feat';
}

export function earnedTitles(
  milestones: MilestoneState[],
  feats: FeatState[],
  bandName: string,
): Title[] {
  const titles: Title[] = [{ id: `rank:${bandName}`, label: bandName, from: 'rank' }];

  for (const milestone of milestones) {
    // Only the highest tier reached is offered; the lower ones would just be
    // the same name with a smaller numeral beside it.
    if (milestone.cleared > 0) {
      titles.push({
        id: `tier:${milestone.id}:${milestone.cleared}`,
        label: milestone.label,
        from: 'milestone',
      });
    }
  }

  for (const feat of feats) {
    if (feat.earned) titles.push({ id: `feat:${feat.id}`, label: feat.name, from: 'feat' });
  }

  return titles;
}

/** The label to show, or null when the stored id is not one they have earned. */
export function titleLabel(id: string | null | undefined, earned: Title[]): string | null {
  if (!id) return null;
  return earned.find((title) => title.id === id)?.label ?? null;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * The words for a stored title id, read straight from the definitions.
 *
 * Whether it was earned is settled when it is saved, and nothing a player has
 * earned can be taken away again — so simply showing a stored title costs no
 * query, which matters on the room page.
 */
export function titleLabelById(id: string | null | undefined): string | null {
  if (!id) return null;
  const [kind, first, second] = id.split(':');

  if (kind === 'rank') return first ?? null;
  if (kind === 'feat') return FEATS.find((feat) => feat.id === first)?.name ?? null;
  if (kind === 'tier') {
    const milestone = MILESTONES.find((entry) => entry.id === first);
    if (!milestone) return null;
    const tier = Number(second);
    if (!Number.isInteger(tier) || tier < 1) return null;
    return `${milestone.name} ${NUMERALS[tier - 1] ?? tier}`;
  }
  return null;
}
