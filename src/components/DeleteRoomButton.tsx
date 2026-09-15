'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface DeleteRoomButtonProps {
  roomCode: string;
}

export function DeleteRoomButton({ roomCode }: DeleteRoomButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  // The row only disappears when the refreshed list arrives, so "Deleting…"
  // lasts until then — not until the request returns, which left a live-looking
  // Delete button on a table that no longer existed.
  const [isRefreshing, startRefresh] = useTransition();
  const busy = isDeleting || isRefreshing;
  const [error, setError] = useState<string | null>(null);

  async function deleteRoom() {
    if (!window.confirm(`Delete room ${roomCode}? This cannot be undone.`)) return;

    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${roomCode}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to delete this room.');
        return;
      }
      startRefresh(() => router.refresh());
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    // The error hangs below the button instead of pushing the row open, so a
    // failed delete does not shove the Open button beside it out of line.
    <div className="relative">
      <button
        type="button"
        onClick={deleteRoom}
        disabled={busy}
        title={`Delete room ${roomCode}`}
        aria-label={busy ? 'Deleting…' : `Delete room ${roomCode}`}
        className="flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-rose-500/40 text-[13px] font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60 @max-2xl:w-10 @2xl:px-3.5"
      >
        {/* A bin in a narrow list, where the row has no width to spare for a
            word. Sized by the list it sits in (@container on the table list). */}
        <Trash2 className="h-4 w-4 shrink-0 @2xl:hidden" aria-hidden="true" />
        <span className="@max-2xl:hidden">{busy ? 'Deleting…' : 'Delete'}</span>
      </button>
      {error ? (
        <p role="alert" className="absolute right-0 top-full z-10 mt-1 w-max max-w-[14rem] text-right text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
