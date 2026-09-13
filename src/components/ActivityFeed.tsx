import Link from 'next/link';
import type { ActivityEntry } from '@/lib/activity';
import { exactly, timeSince } from '@/lib/relative-time';

/**
 * What happened while you were away.
 *
 * Signing in used to tell a returning player nothing they did not already know:
 * their own record, and who was ahead. This is the other half — the last few
 * results, so the board has a story attached to it.
 */

function Mark({ kind }: { kind: ActivityEntry['kind'] }) {
  if (kind === 'coat') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-xs font-bold text-amber-300">
        10
      </span>
    );
  }
  if (kind === 'draw') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-500/15">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path d="M5 9h14M5 15h14" stroke="#ad98cd" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          d="M5 13l4 4 10-10"
          stroke="#6ee7b7"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">Since you were last here</h2>
        <Link
          href="/stats"
          className="text-sm font-medium text-amber-300 transition hover:text-amber-200"
        >
          All results →
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No finished matches yet. The first one played here shows up in this list.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.matchId}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                // A coat is the thing the game is named for, so it is the one
                // line that gets to shout.
                entry.kind === 'coat'
                  ? 'border-amber-400/25 bg-slate-950/70'
                  : 'border-slate-800 bg-slate-950/70'
              }`}
            >
              <Mark kind={entry.kind} />
              <span className="min-w-0 flex-1 text-sm text-slate-200">
                <span className={entry.mine ? 'font-semibold text-white' : 'font-medium text-white'}>
                  {entry.headline}
                </span>
                {entry.detail ? <span className="text-slate-400">, {entry.detail}</span> : null}
              </span>
              <span
                className="shrink-0 text-xs text-slate-500"
                title={exactly(entry.at)}
              >
                {timeSince(entry.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
