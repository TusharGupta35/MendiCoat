'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Title } from '@/lib/titles';

/**
 * Choosing which earned title to wear. Saving happens on click rather than
 * behind a dialog: there is nothing to confirm, and the change is visible
 * immediately in the header above.
 */
export function TitlePicker({ titles, current }: { titles: Title[]; current: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function wear(id: string | null) {
    setSaving(id ?? 'none');
    setError(null);
    try {
      const response = await fetch('/api/user/title', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to save your title.');
        return;
      }
      router.refresh();
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">Title</h2>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
          {titles.length} earned
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Worn beside your name at the table. New ones arrive as you clear tiers and feats.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => wear(null)}
          disabled={saving !== null}
          aria-pressed={current === null}
          className={`rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ${
            current === null
              ? 'border-amber-400 bg-amber-400/15 text-amber-300'
              : 'border-slate-700 text-slate-400 hover:border-slate-500'
          }`}
        >
          No title
        </button>
        {titles.map((title) => (
          <button
            key={title.id}
            type="button"
            onClick={() => wear(title.id)}
            disabled={saving !== null}
            aria-pressed={current === title.id}
            title={
              title.from === 'rank'
                ? 'From your level'
                : title.from === 'feat'
                  ? 'From a feat'
                  : 'From a milestone tier'
            }
            className={`rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ${
              current === title.id
                ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                : 'border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {title.label}
          </button>
        ))}
      </div>

      {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
