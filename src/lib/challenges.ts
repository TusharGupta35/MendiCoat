import { cutterOf, didWin, myHands, myTens, rankOfCard, type PlayedMatch } from '@/lib/stats-core';

/**
 * Three goals a week, drawn from a pool. They exist so there is always
 * something to chase that is not a lifetime total: a new set arrives every
 * Monday whatever your level.
 *
 * Nothing is stored. A week's picks are a function of its number, so past weeks
 * can be replayed to work out XP already earned — which is what stops a level
 * from falling when the week rolls over.
 */

export interface Challenge {
  id: string;
  name: string;
  description: string;
  target: number;
  xp: number;
  /** Counted over one week's matches only. */
  count: (matches: PlayedMatch[]) => number;
}

const POOL: Challenge[] = [
  {
    id: 'win-three',
    name: 'On a Run',
    description: 'Win three matches this week.',
    target: 3,
    xp: 35,
    count: (matches) => matches.filter(didWin).length,
  },
  {
    id: 'play-five',
    name: 'Show Up',
    description: 'Play five matches this week.',
    target: 5,
    xp: 25,
    count: (matches) => matches.length,
  },
  {
    id: 'tens-twelve',
    name: 'Ten Collector',
    description: 'Capture twelve 10s this week.',
    target: 12,
    xp: 35,
    count: (matches) => matches.reduce((total, match) => total + myTens(match), 0),
  },
  {
    id: 'coat-one',
    name: 'Tailor',
    description: 'Deal a coat — all four 10s in one match.',
    target: 1,
    xp: 60,
    count: (matches) => matches.filter((match) => myTens(match) === 4).length,
  },
  {
    id: 'partner-two',
    name: 'Understanding',
    description: 'Win two matches with the same partner.',
    target: 2,
    xp: 30,
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
  {
    id: 'no-cut-win',
    name: 'Straight Bat',
    description: 'Win a match without ever cutting.',
    target: 1,
    xp: 45,
    count: (matches) =>
      matches.filter(
        (match) =>
          didWin(match) &&
          !match.tricks.some((trick) => cutterOf(trick)?.seat === match.seat),
      ).length,
  },
  {
    id: 'low-cut',
    name: 'Cheap Trick',
    description: 'Fix trump with a card below a 5 and win that trick.',
    target: 1,
    xp: 45,
    count: (matches) =>
      matches.filter((match) =>
        match.tricks.some((trick) => {
          const cut = cutterOf(trick);
          if (!cut || cut.seat !== match.seat) return false;
          const rank = Number(rankOfCard(cut.card));
          return rank >= 2 && rank <= 4 && trick.winnerSeat === match.seat;
        }),
      ).length,
  },
  {
    id: 'dominant',
    name: 'One-Sided',
    description: 'Win a match taking at least ten of the thirteen tricks.',
    target: 1,
    xp: 45,
    count: (matches) => matches.filter((match) => didWin(match) && myHands(match) >= 10).length,
  },
];

/**
 * Which week a moment falls in, counted from the first Monday.
 *
 * Bucketing straight off the epoch would put the boundary on a Thursday — 1
 * January 1970 was one — and the page promises a new set every Monday. Day 4
 * was the first Monday, so weeks are measured from there. Boundaries are UTC,
 * so a player east of it rolls over during Monday morning rather than midnight.
 */
export function weekOf(date: Date): number {
  const days = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  return Math.floor((days - 4) / 7);
}

/**
 * The Monday a week number starts, in UTC — the inverse of weekOf. Anything
 * counted "this week" has to agree with the challenges, so both sides read the
 * same boundary rather than each rolling their own.
 */
export function weekStart(week: number): Date {
  return new Date((week * 7 + 4) * 24 * 60 * 60 * 1000);
}

/**
 * The three challenges for a week. Deterministic from the week number, so
 * everyone gets the same set and any past week can be recomputed.
 */
/** JavaScript's % keeps the sign of the left operand, which would index off the
 *  front of the pool for any week before the first Monday of 1970. */
const wrap = (value: number, size: number) => ((value % size) + size) % size;

export function challengesForWeek(week: number): Challenge[] {
  const picks: Challenge[] = [];
  // Step through the pool by a stride that shares no factor with its length,
  // so consecutive weeks do not repeat the same trio.
  const stride = 3;
  for (let i = 0; i < 3; i += 1) {
    const index = wrap(week * stride + i * 3 + Math.floor(week / POOL.length), POOL.length);
    const pick = POOL[index];
    if (picks.some((chosen) => chosen.id === pick.id)) {
      picks.push(POOL[wrap(index + 1, POOL.length)]);
    } else {
      picks.push(pick);
    }
  }
  return picks;
}

export interface ChallengeState extends Challenge {
  progress: number;
  done: boolean;
}

function evaluate(challenges: Challenge[], matches: PlayedMatch[]): ChallengeState[] {
  return challenges.map((challenge) => {
    const progress = challenge.count(matches);
    return { ...challenge, progress: Math.min(progress, challenge.target), done: progress >= challenge.target };
  });
}

function groupByWeek(matches: PlayedMatch[]): Map<number, PlayedMatch[]> {
  const byWeek = new Map<number, PlayedMatch[]>();
  for (const match of matches) {
    if (!match.finishedAt) continue;
    const week = weekOf(match.finishedAt);
    byWeek.set(week, [...(byWeek.get(week) ?? []), match]);
  }
  return byWeek;
}

/** This week's set, with progress from this week's matches. */
export function currentChallenges(matches: PlayedMatch[], now = new Date()): ChallengeState[] {
  const week = weekOf(now);
  const thisWeek = groupByWeek(matches).get(week) ?? [];
  return evaluate(challengesForWeek(week), thisWeek);
}

/**
 * XP from every challenge ever completed, replayed week by week. Without this
 * a level would drop each Monday as the current week's completions reset.
 */
export function challengeXpEarned(matches: PlayedMatch[]): number {
  let total = 0;
  for (const [week, weekMatches] of groupByWeek(matches)) {
    for (const challenge of evaluate(challengesForWeek(week), weekMatches)) {
      if (challenge.done) total += challenge.xp;
    }
  }
  return total;
}
