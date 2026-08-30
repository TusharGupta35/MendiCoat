'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The name field, for use inside the profile modal.
 *
 * It used to be a pencil beside the greeting with a modal of its own, which
 * meant two ways into the same thing: a player changing how they appear at the
 * table had to know that the face was behind their picture and the name was
 * behind a pencil. Both now live behind the picture.
 *
 * It saves on its own rather than sharing a Save with the avatar, because the
 * two are separate writes and a shared button would have to explain which half
 * failed when one of them did.
 */
export function UsernameField({
  username,
  fallbackName,
  disabled = false,
}: {
  username: string | null;
  /** Shown as the current handle while no username has been picked. */
  fallbackName: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(username ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const unchanged = draft.trim() === (username ?? '');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch('/api/user/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: draft }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to save your username.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <label htmlFor="username" className="text-xs uppercase tracking-[0.16em] text-slate-400">
        Your name
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="username"
          name="username"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setSaved(false);
          }}
          maxLength={20}
          disabled={disabled || isSaving}
          placeholder={fallbackName}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none transition focus:border-amber-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || isSaving || unchanged}
          className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-amber-400/60 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : saved ? 'Saved' : 'Save name'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        3–20 characters. Letters, numbers, spaces, underscores and hyphens. This is the name the
        other three see at the table.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
