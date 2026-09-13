import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { PlayerCard } from '@/components/PlayerCard';
import type { ChallengeState } from '@/lib/challenges';
import type { Level } from '@/lib/progression';
import type { CareerStats, RivalRecord } from '@/lib/stats-core';

/**
 * The dashboard's left column: you.
 *
 * The header used to carry your identity, squeezed against the right edge of a
 * bar. Here it is a column of its own — the card, what is left to do this week,
 * and who you are chasing — and the rest of the page is what you can do.
 *
 * It sticks on a wide screen so the answer to "how am I doing" stays on screen
 * while the right-hand column is read. On a phone the grid puts it first in the
 * stack and it scrolls with everything else; the component is the same either
 * way.
 */

/** The three weekly goals, as compact bars. The full wording lives on /stats. */
function WeekStrip({ challenges }: { challenges: ChallengeState[] }) {
  const done = challenges.filter((challenge) => challenge.done).length;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">This week</h2>
        <span className="rounded-full bg-slate-950/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-slate-400">
          {done} of {challenges.length}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {challenges.map((challenge) => (
          <div
            key={challenge.id}
            className={`rounded-xl border p-3 ${
              challenge.done
                ? 'border-emerald-400/40 bg-emerald-500/10'
                : 'border-slate-800 bg-slate-950/70'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={`text-[13px] font-semibold ${
                  challenge.done ? 'text-emerald-300' : 'text-white'
                }`}
              >
                {challenge.name}
              </p>
              <span
                className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                  challenge.done ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                +{challenge.xp}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{challenge.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-950">
                <div
                  className={`h-full rounded-full ${
                    challenge.done ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                  style={{
                    width: `${Math.max(3, Math.min(100, Math.round((challenge.progress / challenge.target) * 100)))}%`,
                  }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-slate-500">
                {challenge.progress}/{challenge.target}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">A new set of three arrives every Monday.</p>
    </div>
  );
}

/**
 * The player nearest you on the board, and your record against them.
 *
 * "Nearest" is by XP rather than by how often you play them: the interesting
 * rival is the one you could overtake this week. The head-to-head under it is
 * read off your own match history, so it costs no extra query.
 */
function RivalCard({ rival, xpGap }: { rival: RivalRecord; xpGap: number }) {
  const decided = rival.won + rival.lost;
  const mine = decided === 0 ? 50 : Math.round((rival.won / decided) * 100);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <h2 className="text-lg font-semibold text-white">Closest rival</h2>

      <Link
        href={`/players/${rival.userId}`}
        className="mt-3 flex items-center gap-3 rounded-xl p-1 transition hover:bg-slate-800/60"
      >
        <Avatar
          avatar={rival.avatar}
          userKey={rival.userId}
          name={rival.name}
          photo={rival.image}
          className="h-10 w-10"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{rival.name}</p>
          <p className="text-xs text-slate-500">
            {xpGap === 0
              ? 'Level with you on XP'
              : xpGap > 0
                ? `${xpGap.toLocaleString()} XP ahead of you`
                : `${Math.abs(xpGap).toLocaleString()} XP behind you`}
          </p>
        </div>
      </Link>

      {rival.played === 0 ? (
        <p className="mt-3 text-xs text-slate-500">You have not sat on opposite sides yet.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="w-6 text-lg font-bold tabular-nums text-emerald-300">{rival.won}</span>
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-slate-950">
              <div className="bg-emerald-400" style={{ width: `${mine}%` }} />
              <div className="flex-1 bg-rose-400" />
            </div>
            <span className="w-6 text-right text-lg font-bold tabular-nums text-rose-300">
              {rival.lost}
            </span>
          </div>
          <p className="mt-1.5 text-center text-xs text-slate-500">
            Head to head over {rival.played} {rival.played === 1 ? 'match' : 'matches'}
          </p>
        </>
      )}
    </div>
  );
}

export function PlayerRail({
  userId,
  name,
  avatar,
  photo,
  wearing,
  level,
  band,
  stats,
  challenges,
  rival,
  rivalXpGap,
}: {
  userId: string;
  name: string;
  avatar: string | null;
  photo?: string | null;
  wearing: string | null;
  level: Level;
  band: { name: string; nextAt: number | null };
  stats: CareerStats;
  challenges: ChallengeState[];
  rival: RivalRecord | null;
  rivalXpGap: number;
}) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
      <PlayerCard
        userId={userId}
        name={name}
        avatar={avatar}
        photo={photo}
        wearing={wearing}
        level={level}
        band={band}
        stats={stats}
      />

      <WeekStrip challenges={challenges} />

      {rival ? <RivalCard rival={rival} xpGap={rivalXpGap} /> : null}

      <Link
        href="/stats"
        className="rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-medium text-slate-200 transition hover:bg-slate-800"
      >
        Your full record →
      </Link>
    </aside>
  );
}
