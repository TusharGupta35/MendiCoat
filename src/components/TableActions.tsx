'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Game } from '@/games/registry';

/**
 * Open a table, or walk into one by code — on the dashboard itself.
 *
 * Both of these already existed, one behind a game page and one behind
 * /room/join. Neither is a page's worth of decision, and both are the first
 * thing somebody signing in wants, so they live on the front door now.
 *
 * "Start a table" has to choose a game, and there is more than one live, so it
 * opens a short menu rather than guessing. With a single live game it would be
 * a plain button, which is what the menu collapses to on its own.
 */
export function TableActions({ games }: { games: Game[] }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  // A menu that cannot be dismissed by clicking away or pressing escape is a
  // trap on a touch screen, where there is no other way out.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (codeOpen) codeInput.current?.focus();
  }, [codeOpen]);

  async function startTable(gameId: string) {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to open a table.');
        return;
      }
      router.push(`/room/${payload.code}`);
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function joinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
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
      setBusy(false);
    }
  }

  const single = games.length === 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            disabled={busy}
            onClick={() => (single ? startTable(games[0].id) : setMenuOpen((open) => !open))}
            aria-haspopup={single ? undefined : 'menu'}
            aria-expanded={single ? undefined : menuOpen}
            className="flex h-[52px] items-center gap-2 rounded-xl bg-amber-500 px-6 text-base font-semibold text-amber-950 transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            {busy ? 'Opening…' : 'Start a table'}
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-64 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-1.5 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.95)]"
            >
              {games.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  role="menuitem"
                  onClick={() => startTable(game.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-white">{game.name}</span>
                    <span className="block truncate text-xs text-slate-400">{game.players}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {codeOpen ? (
          <form onSubmit={joinByCode} className="flex items-center gap-2">
            <label className="flex h-[52px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-4">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                Code
              </span>
              <input
                ref={codeInput}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={4}
                required
                aria-label="Room code"
                className="w-24 bg-transparent text-xl font-bold tracking-[0.24em] tabular-nums text-white outline-none placeholder:text-slate-600"
                placeholder="····"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-[52px] rounded-xl border border-slate-700 px-5 font-medium transition hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCodeOpen(true)}
            className="h-[52px] rounded-xl border border-slate-700 px-5 font-medium transition hover:bg-slate-800"
          >
            Join with a code
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
