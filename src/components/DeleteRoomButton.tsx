'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface DeleteRoomButtonProps {
  roomCode: string;
}

export function DeleteRoomButton({ roomCode }: DeleteRoomButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
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
      router.refresh();
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={deleteRoom}
        disabled={isDeleting}
        className="rounded-md border border-rose-500/40 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? 'Deleting…' : 'Delete'}
      </button>
      {error ? <p role="alert" className="mt-1 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
