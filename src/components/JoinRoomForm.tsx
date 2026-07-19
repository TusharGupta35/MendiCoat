'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsJoining(true);
    setError(null);

    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to join this room.');
        return;
      }
      router.push(`/room/${payload.code}`);
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsJoining(false);
    }
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
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono tracking-[0.18em] text-slate-100 outline-none transition focus:border-amber-400"
      />
      {error ? <p id="room-code-error" role="alert" className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        disabled={isJoining}
        className="w-full rounded-lg bg-amber-500 px-4 py-3 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isJoining ? 'Joining…' : 'Join room'}
      </button>
    </form>
  );
}
