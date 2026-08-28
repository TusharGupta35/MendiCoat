'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { takeSnapshot, type ProgressNews, type ProgressSnapshot } from '@/lib/progress-feed';

/**
 * Announces what changed since this browser last looked: levels gained, tiers
 * cleared, feats earned, challenges completed.
 *
 * The comparison is against localStorage rather than anything stored server
 * side, so it costs no schema. The trade is that it is per-browser: the same
 * level-up will be announced again on another device, once.
 */

export function ProgressToast({ news, onClose }: { news: ProgressNews; onClose: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-full max-w-sm rounded-2xl border border-amber-400/40 bg-slate-900 p-4 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {news.levelsGained > 0 ? (
            <>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-400">
                {news.levelsGained === 1 ? 'Level up' : `Up ${news.levelsGained} levels`}
              </p>
              <p className="font-display text-2xl font-semibold text-white">
                Level {news.level}
              </p>
            </>
          ) : (
            <p className="text-xs uppercase tracking-[0.3em] text-amber-400">Unlocked</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {news.unlocks.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {news.unlocks.slice(0, 4).map((unlock) => (
            <li
              key={unlock.key}
              className="flex items-center gap-3 rounded-lg bg-slate-950/70 p-2.5"
            >
              <span className="text-xl" aria-hidden="true">{unlock.badge}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-amber-200">{unlock.label}</span>
                <span className="block truncate text-xs text-slate-400">{unlock.detail}</span>
              </span>
              {unlock.xp > 0 ? (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-300">
                  +{unlock.xp}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {news.unlocks.length > 4 ? (
        <p className="mt-2 text-xs text-slate-500">
          and {news.unlocks.length - 4} more
        </p>
      ) : null}
    </div>
  );
}

/**
 * Server-rendered pages hand in the current snapshot; this decides whether any
 * of it is news. A browser that has never stored a snapshot is a first visit —
 * it records silently rather than celebrating a whole back catalogue.
 */
export function ProgressWatch({ snapshot }: { snapshot: ProgressSnapshot }) {
  const [news, setNews] = useState<ProgressNews | null>(null);

  useEffect(() => {
    setNews(takeSnapshot(snapshot));
  }, [snapshot]);

  if (!news) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6">
      <ProgressToast news={news} onClose={() => setNews(null)} />
    </div>
  );
}
