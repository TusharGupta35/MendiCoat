'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CreateRoomButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to create a room.');
        return;
      }
      router.push(`/room/${payload.code}`);
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={createRoom}
        disabled={isCreating}
        className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCreating ? 'Creating…' : 'Create room'}
      </button>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
