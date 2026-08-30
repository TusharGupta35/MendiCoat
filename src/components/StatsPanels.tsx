import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import type { ChallengeState } from '@/lib/challenges';
import type { FeatState } from '@/lib/feats';
import { bandForLevel, type Level, type MilestoneState } from '@/lib/progression';
import type { CareerStats, PartnerRecord } from '@/lib/stats-core';
import { exactly, timeSince } from '@/lib/relative-time';
import type { LeaderboardRow, XpRow } from '@/lib/stats';

/** Presentational only — every panel takes plain data so it can be rendered anywhere. */

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-950/70 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** The band a level starts, so the badge can name what is being climbed toward. */
function nextBandName(startsAt: number) {
  return bandForLevel(startsAt).name;
}

export function LevelBadge({
  level,
  band,
}: {
  level: Level;
  band: { name: string; nextAt: number | null };
}) {
  const filled = Math.round((level.into / level.span) * 100);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-xl font-semibold text-amber-300">
          Level {level.level}
          <span className="ml-2 text-sm font-medium text-slate-400">{band.name}</span>
        </p>
        <p className="text-xs tabular-nums text-slate-400">
          {level.into} / {level.span} XP
          {band.nextAt === null
            ? null
            : ` · ${band.nextAt - level.level} ${
                band.nextAt - level.level === 1 ? 'level' : 'levels'
              } to ${nextBandName(band.nextAt)}`}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
          style={{ width: `${Math.max(3, Math.min(100, filled))}%` }}
        />
      </div>
    </div>
  );
}

/** The compact dashboard card. Links through to the full record. */
export function RecordCard({
  stats,
  level,
  band,
}: {
  stats: CareerStats;
  level: Level;
  band: { name: string; nextAt: number | null };
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">Your record</h2>
        <Link href="/stats" className="text-sm font-medium text-amber-300 transition hover:text-amber-200">
          Full stats →
        </Link>
      </div>

      <div className="mt-4">
        <LevelBadge level={level} band={band} />
      </div>

      {stats.played === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No finished matches yet. Play one and the XP starts here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Played" value={stats.played} />
            <Stat label="Won" value={stats.won} hint={`${stats.winRate}% win rate`} />
            <Stat label="10s" value={stats.tensCaptured} />
            <Stat label="Coats" value={stats.coatsDealt} hint={`${stats.coatsTaken} taken`} />
          </div>
        </>
      )}
    </div>
  );
}

export function StreakStrip({ stats }: { stats: CareerStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Current streak" value={stats.currentStreak} />
      <Stat label="Best streak" value={stats.bestStreak} />
      <Stat label="Lost" value={stats.lost} />
      <Stat label="Drawn" value={stats.drawn} />
    </div>
  );
}

export function ChallengeList({ challenges }: { challenges: ChallengeState[] }) {
  const done = challenges.filter((challenge) => challenge.done).length;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">This week</h2>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
          {done} of {challenges.length} done
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-400">A new set of three arrives every Monday.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {challenges.map((challenge) => (
          <div
            key={challenge.id}
            className={`rounded-lg border p-3 ${
              challenge.done ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/70'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className={`font-medium ${challenge.done ? 'text-emerald-300' : 'text-white'}`}>
                {challenge.name}
              </p>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-300">
                +{challenge.xp} XP
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{challenge.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-950">
                <div
                  className={`h-full rounded-full ${challenge.done ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${Math.round((challenge.progress / challenge.target) * 100)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-slate-500">
                {challenge.progress}/{challenge.target}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MilestoneGrid({ milestones }: { milestones: MilestoneState[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-white">Milestones</h2>
      <p className="mt-1 text-sm text-slate-400">
        Each tier cleared pays XP and sets the next one.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {milestones.map((milestone) => {
          const span = (milestone.target ?? milestone.count) - milestone.floor;
          const into = milestone.count - milestone.floor;
          const filled = milestone.target === null ? 100 : Math.round((into / span) * 100);

          return (
            <div key={milestone.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">{milestone.badge}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-white">{milestone.label}</p>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      {milestone.target === null
                        ? 'Maxed'
                        : `${milestone.count} / ${milestone.target}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-400">{milestone.unit}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                      style={{ width: `${Math.max(2, Math.min(100, filled))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FeatGrid({ feats }: { feats: FeatState[] }) {
  const earned = feats.filter((feat) => feat.earned).length;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">Feats</h2>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
          {earned} of {feats.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-400">One-off things, done once or not yet.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {feats.map((feat) => (
          <div
            key={feat.id}
            className={`flex gap-3 rounded-lg border p-3 ${
              feat.earned ? 'border-amber-400/40 bg-amber-500/10' : 'border-slate-800 bg-slate-950/70'
            }`}
          >
            <span className={`text-2xl ${feat.earned ? '' : 'opacity-40 grayscale'}`} aria-hidden="true">
              {feat.badge}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`font-medium ${feat.earned ? 'text-amber-200' : 'text-slate-300'}`}>
                  {feat.name}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">+{feat.xp}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-400">{feat.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PartnerTable({ partners }: { partners: PartnerRecord[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-white">Partners</h2>
      <p className="mt-1 text-sm text-slate-400">
        How you do with the player sitting opposite you.
      </p>
      {partners.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No partnered matches yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {partners.map((partner) => (
            <li
              key={partner.userId}
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/70 p-3"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  avatar={partner.avatar}
                  userKey={partner.userId}
                  name={partner.name}
                  className="h-8 w-8"
                />
                <span className="min-w-0 truncate font-medium text-white">{partner.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sm">
                <span className="tabular-nums text-slate-400">
                  {partner.won}/{partner.played}
                </span>
                <span className="w-12 text-right font-semibold tabular-nums text-amber-300">
                  {partner.winRate}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * When this player was last at a table. Only finished matches are recorded, so
 * that is what "active" can honestly mean here — somebody who signed in and
 * watched is not counted.
 */
function LastPlayed({ at, className = '' }: { at: Date | null; className?: string }) {
  const label = timeSince(at);
  return (
    <span className={`text-xs text-slate-500 ${className}`} title={exactly(at)}>
      {label ? `Last played ${label}` : 'No matches yet'}
    </span>
  );
}

function LeaderRow({
  row,
  place,
  meId,
}: {
  row: LeaderboardRow;
  place: number;
  meId: string;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg p-3 ${
        row.userId === meId ? 'bg-amber-500/10 ring-1 ring-amber-400/40' : 'bg-slate-950/70'
      }`}
    >
      <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-500">
        {place}
      </span>
      <Avatar avatar={row.avatar} userKey={row.userId} name={row.name} className="h-8 w-8" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-white">{row.name}</span>
        <LastPlayed at={row.lastPlayed} className="block truncate" />
      </span>
      <span className="shrink-0 text-sm tabular-nums text-slate-400">
        {row.won}/{row.played}
      </span>
      <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-amber-300">
        {row.winRate}%
      </span>
    </li>
  );
}

export function Leaderboard({ rows, meId }: { rows: LeaderboardRow[]; meId: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-white">Leaderboard</h2>
      <p className="mt-1 text-sm text-slate-400">Matches against bots do not count.</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          Nobody has finished an all-human match yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <LeaderRow key={row.userId} row={row} place={index + 1} meId={meId} />
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Who is furthest along, on the level everyone shares.
 *
 * This is the dashboard's headline board, so it is ranked on XP rather than on
 * wins in a window: XP is what every game on the board will pay into, and it is
 * the only number that still means the same thing once there is more than one
 * game to be good at.
 */
export function TopPlayers({ rows, meId }: { rows: XpRow[]; meId: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">Top players</h2>
        {/* Five is the board; everybody is a page. */}
        <Link
          href="/players"
          className="text-sm font-medium text-amber-300 transition hover:text-amber-200"
        >
          See all →
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        The five furthest along, by XP earned across every game.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          Nobody has finished a match yet. Play one and this is your board to lead.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <li key={row.userId}>
              <Link
                href={`/players/${row.userId}`}
                className={`flex items-center gap-3 rounded-lg p-3 transition hover:bg-slate-800 ${
                  row.userId === meId
                    ? 'bg-amber-500/10 ring-1 ring-amber-400/40'
                    : 'bg-slate-950/70'
                }`}
              >
                <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-500">
                  {index + 1}
                </span>
                <Avatar
                  avatar={row.avatar}
                  userKey={row.userId}
                  name={row.name}
                  className="h-8 w-8"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">{row.name}</span>
                  {/* The band is what a level is called, so it says more than the
                      number does on its own; when they were last here says
                      whether the name above is still playing. */}
                  <span className="block truncate text-xs text-slate-500">
                    {row.band} · {timeSince(row.lastPlayed) ?? 'no matches yet'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-amber-300">
                    Level {row.level}
                  </span>
                  <span className="block text-xs tabular-nums text-slate-500">
                    {row.totalXp.toLocaleString()} XP
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The same ranking over one week of matches, on wins rather than XP. It lives
 * beside the all-time board on the stats page, where a board that can be empty
 * for a week is a detail rather than the headline.
 */
export function WeeklyTopFive({ rows, meId }: { rows: LeaderboardRow[]; meId: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-white">This week</h2>
      <p className="mt-1 text-sm text-slate-400">
        Top 5 by wins since Monday. Matches against bots do not count.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No all-human match has finished this week — win one and the top spot is yours.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <LeaderRow key={row.userId} row={row} place={index + 1} meId={meId} />
          ))}
        </ol>
      )}
    </div>
  );
}
