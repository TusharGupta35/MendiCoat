'use client';

import { Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, LevelAvatar } from '@/components/Avatar';
import { UsernameField } from '@/components/UsernameField';
import { AVATARS } from '@/lib/avatars';

interface AvatarPickerProps {
  /** The saved pick, or null while the player still has the default. */
  avatar: string | null;
  /** Stable key behind the default face, so it matches what is shown elsewhere. */
  userKey: string;
  name: string;
  photo?: string | null;
  /** When given, the avatar wears the level ring. */
  level?: { level: number; into: number; span: number };
  /** The saved username, or null while the player still uses their Google name. */
  username?: string | null;
}

/**
 * The player's face, and the modal behind it for changing how they appear at
 * the table — both the face and the name.
 *
 * The name used to have a pencil and a modal of its own, which meant two ways
 * into one idea. Tapping your own picture is the thing people try first, so
 * that is where both live now.
 */
export function AvatarPicker({ avatar, userKey, name, photo, level, username }: AvatarPickerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [choice, setChoice] = useState(avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setChoice(avatar);
    setError(null);
    setIsOpen(true);
  }

  function closeModal() {
    if (isSaving) return;
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    // Stop the page behind the modal from scrolling under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  async function save() {
    if (!choice) return;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/user/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: choice }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to save your avatar.');
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
      <button
        type="button"
        onClick={openModal}
        title="Change your avatar"
        aria-label="Change your avatar"
        className="rounded-full transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        {level ? (
          <LevelAvatar
            avatar={avatar}
            userKey={userKey}
            name={name}
            photo={photo}
            level={level.level}
            into={level.into}
            span={level.span}
            className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]"
          />
        ) : (
          <Avatar
            avatar={avatar}
            userKey={userKey}
            name={name}
            photo={photo}
            className="h-14 w-14 sm:h-16 sm:w-16"
          />
        )}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="avatar-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="avatar-modal-title" className="text-xl font-semibold text-white">
                  Your player
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  The name and the face the other three see at the table.
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

            <div className="mt-5">
              <UsernameField username={username ?? null} fallbackName={name} disabled={isSaving} />
            </div>

            <p className="mt-5 text-xs uppercase tracking-[0.16em] text-slate-400">Your face</p>
            <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {AVATARS.map((option) => {
                const selected = choice === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setChoice(option.id)}
                    aria-pressed={selected}
                    className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
                      selected
                        ? 'border-amber-400 bg-amber-500/10'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                    }`}
                  >
                    <Avatar
                      avatar={option.id}
                      userKey={option.id}
                      name={option.label}
                      className="h-14 w-14"
                    />
                    <span className="w-full truncate text-center text-xs text-slate-300">
                      {option.label}
                    </span>
                    {selected ? (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 p-0.5 text-slate-950">
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {error ? <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p> : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isSaving || !choice || choice === avatar}
                className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
