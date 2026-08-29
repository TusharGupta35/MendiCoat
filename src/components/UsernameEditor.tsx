'use client';

import { Pencil, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface UsernameEditorProps {
  /** The saved username, or null when the player still uses their Google name. */
  username: string | null;
  /** Shown as the current handle while no username has been picked. */
  fallbackName: string;
}

/**
 * Renders the dashboard greeting with a pencil beside it. The whole edit flow
 * lives in a modal so the dashboard itself stays a single, uncluttered header.
 */
export function UsernameEditor({ username, fallbackName }: UsernameEditorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(username ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = username ?? fallbackName;

  function openModal() {
    setDraft(username ?? '');
    setError(null);
    setIsOpen(true);
  }

  function closeModal() {
    if (isSaving) return;
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    inputRef.current?.select();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    // Stop the dashboard behind the modal from scrolling under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

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
      setIsOpen(false);
      router.refresh();
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {/* The greeting is its own small line above the name. On a phone
          "Welcome back, TYPHOON" on one line either truncates or shoves the
          avatar off the row; split in two, the name is never the thing that
          gets cut.

          The pencil follows the text's edge: after the name on a phone, where
          the block is left-aligned, and before it on a wide screen, where the
          block is right-aligned and the name should keep the edge. */}
      <div className="flex items-center justify-start gap-2 sm:flex-row-reverse">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
            Welcome back
          </p>
          <h1 className="truncate text-2xl font-semibold leading-tight text-white sm:text-3xl">
            {displayName}
          </h1>
        </div>
        <button
          type="button"
          onClick={openModal}
          aria-label="Edit your username"
          title="Edit your username"
          className="shrink-0 rounded-lg border border-slate-700 p-1.5 text-slate-400 transition hover:border-amber-400/60 hover:bg-slate-800 hover:text-amber-300"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="username-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            // Only a click on the backdrop itself dismisses the modal.
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="username-modal-title" className="text-xl font-semibold text-white">
                  Edit username
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  This is the name the other three players see at the table.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={saveUsername} className="mt-5 space-y-3">
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                ref={inputRef}
                id="username"
                name="username"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={20}
                placeholder="Pick something fun"
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none transition focus:border-amber-400"
              />
              <p className="text-xs text-slate-500">
                3–20 characters. Letters, numbers, spaces, underscores and hyphens.
              </p>
              {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
