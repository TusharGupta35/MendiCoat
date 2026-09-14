'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { hidePageLoading, showPageLoading } from '@/components/NavigationLoader';

/**
 * The way into an invite-only table.
 *
 * Its row is deliberately printed without a code, so there is nothing here to
 * click through to — the code the host sent you is the credential, and typing
 * it is the act of being invited. The POST is the same one an open seat makes;
 * only the question differs.
 */
export function EnterCodeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
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
        // A wrong code reads as "not found", which is the honest answer: this
        // control cannot know which table you meant.
        fail(payload.error ?? 'Unable to join this table.');
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
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-700 px-3.5 text-[13px] font-medium text-slate-200 transition hover:bg-slate-800 sm:px-4 sm:text-sm"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            d="M17 10V8a5 5 0 0 0-10 0v2"
            stroke="currentColor"
            strokeWidth="1.9"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="5" y="10" width="14" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.9" fill="none" />
        </svg>
        Enter code
      </button>
    );
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          ref={input}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={4}
          required
          aria-label="Room code"
          placeholder="····"
          className="h-10 w-[5.5rem] rounded-xl border border-slate-700 bg-slate-950 px-3 text-center font-display text-base font-bold tracking-[0.2em] tabular-nums text-white outline-none transition focus:border-amber-400 placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex h-10 items-center rounded-xl bg-amber-500 px-4 text-sm font-semibold text-amber-950 transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
      {error ? (
        <span role="alert" className="text-[11px] text-rose-300">
          {error}
        </span>
      ) : null}
    </span>
  );
}
