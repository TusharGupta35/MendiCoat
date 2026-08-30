import { cutterOf, didWin, myHands, myTens, rankOfCard, theirTens, type PlayedMatch } from '@/lib/stats-core';

/**
 * One-shot feats: rare things you either did once or have not done yet.
 *
 * Anything countable — wins, matches, 10s — belongs in MILESTONES instead,
 * where it gains a new tier each time it is cleared. Feats are deliberately
 * finite; they are souvenirs, not the progression.
 */

export interface Feat {
  id: string;
  name: string;
  description: string;
  badge: string;
  xp: number;
  achieved: (matches: PlayedMatch[]) => boolean;
}

/** Every trick in a match where this player was the one who fixed trump. */
const cutsByPlayer = (match: PlayedMatch) =>
  match.tricks.filter((trick) => cutterOf(trick)?.seat === match.seat);

export const FEATS: Feat[] = [
  {
    id: 'clean-sheet',
    name: 'Clean Sheet',
    description: 'Win a match without losing a single trick.',
    badge: '🧹',
    xp: 80,
    achieved: (matches) => matches.some((match) => didWin(match) && myHands(match) === 13),
  },
  {
    id: 'low-cut',
    name: 'Low Blow',
    description: 'Fix trump with a 2 and take the trick with it.',
    badge: '🔪',
    xp: 60,
    achieved: (matches) =>
      matches.some((match) =>
        match.tricks.some((trick) => {
          const cut = cutterOf(trick);
          return (
            cut?.seat === match.seat &&
            rankOfCard(cut.card) === '2' &&
            trick.winnerSeat === match.seat
          );
        }),
      ),
  },
  {
    id: 'no-cut-win',
    name: 'Straight Bat',
    description: 'Win a match without ever cutting.',
    badge: '🎩',
    xp: 45,
    achieved: (matches) => matches.some((match) => didWin(match) && cutsByPlayer(match).length === 0),
  },
  {
    id: 'comeback',
    name: 'On the Tie-break',
    description: 'Win a match level on 10s, taking it on tricks.',
    badge: '⚖️',
    xp: 45,
    achieved: (matches) => matches.some((match) => didWin(match) && myTens(match) === theirTens(match)),
  },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Win the match straight after being coated.',
    badge: '🔥',
    xp: 60,
    achieved: (matches) => {
      const ordered = [...matches].sort(
        (a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0),
      );
      return ordered.some(
        (match, index) => index > 0 && theirTens(ordered[index - 1]) === 4 && didWin(match),
      );
    },
  },
];

export interface FeatState extends Feat {
  earned: boolean;
}

export function evaluateFeats(matches: PlayedMatch[]): FeatState[] {
  return FEATS.map((feat) => ({ ...feat, earned: feat.achieved(matches) }));
}

export function featXpEarned(matches: PlayedMatch[]): number {
  return evaluateFeats(matches).reduce((total, feat) => total + (feat.earned ? feat.xp : 0), 0);
}
