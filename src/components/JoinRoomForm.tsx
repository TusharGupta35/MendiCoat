'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hidePageLoading, showPageLoading } from '@/components/NavigationLoader';

export function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsJoining(true);
    setError(null);
    // Up at the click and left up on success; the route change takes it down.
    showPageLoading();

    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      if (!response.ok) {
        fail(payload.error ?? 'Unable to join this room.');
        return;
      }
      router.push(`/room/${payload.code}`);
    } catch {
      fail('A network error occurred. Please try again.');
    }
  }

  function fail(message: string) {
    hidePageLoading();
    setError(message);
    setIsJoining(false);
  }

  return (
    <form onSubmit={joinRoom} className="mt-6 space-y-4">
      <input
        name="code"
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        maxLength={4}
        required
        placeholder="ROOM CODE"
        aria-describedby={error ? 'room-code-error' : undefined}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center font-display text-2xl font-bold tracking-[0.3em] text-white outline-none transition placeholder:text-base placeholder:font-medium placeholder:tracking-[0.2em] placeholder:text-slate-600 focus:border-amber-400"
      />
      {error ? <p id="room-code-error" role="alert" className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={isJoining}
        className="w-full rounded-xl bg-amber-500 px-4 py-3 font-semibold text-amber-950 transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isJoining ? 'Joining…' : 'Join room'}
      </button>
    </form>
  );
}
