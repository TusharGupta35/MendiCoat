'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface UsernameCardProps {
  /** The saved username, or null when the player still uses their Google name. */
  username: string | null;
  /** Shown as the current handle while no username has been picked. */
  fallbackName: string;
}

export function UsernameCard({ username, fallbackName }: UsernameCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(username ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(username ?? '');
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(username ?? '');
    setError(null);
    setIsEditing(false);
  }

  async function saveUsername(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

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
      setIsEditing(false);
      router.refresh();
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Your username</h2>
          <p className="mt-2 text-sm text-slate-400">
            This is the name the other three players see at the table.
          </p>
        </div>
        {isEditing ? null : (
          <button
            type="button"
            onClick={startEditing}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={saveUsername} className="mt-4 space-y-3">
          <label htmlFor="username" className="sr-only">
            Username
          </label>
          <input
            id="username"
            name="username"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            maxLength={20}
            placeholder="Pick something fun"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none transition focus:border-amber-400"
          />
          <p className="text-xs text-slate-500">
            3–20 characters. Letters, numbers, spaces, underscores and hyphens.
          </p>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
          {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
        </form>
      ) : (
        <div className="mt-4">
          <p className="text-2xl font-semibold text-amber-300">{username ?? fallbackName}</p>
          {username ? null : (
            <p className="mt-1 text-sm text-slate-500">
              Using your account name until you pick one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
