'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { hidePageLoading, showPageLoading } from '@/components/NavigationLoader';
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

  // Both actions raise the loading screen at the click, before the request, and
  // leave it up on success: router.push returns at once, and resetting `busy`
  // in a finally block used to flash the old buttons back while the table was
  // still on its way. The route change clears the screen; a failure clears it
  // here, next to the error that explains why.
  async function startTable(gameId: string) {
    setBusy(true);
    setError(null);
    setMenuOpen(false);
    showPageLoading();
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        fail(payload.error ?? 'Unable to open a table.');
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

  async function joinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
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

  const single = games.length === 1;

  return (
    <div className="flex flex-col gap-2">
      {/* One row on a phone, with short labels. Stacked full-width buttons
          were two 48px bars before the first table; side by side with the
          full labels they did not fit — "Start a table" wrapped at ~147px.
          "New table" and "Join by code" fit at 320px with room to spare. From
          sm up the full labels and sizes are back. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <div className="relative min-w-0 flex-1 sm:flex-none" ref={menuRef}>
          <button
            type="button"
            disabled={busy}
            onClick={() => (single ? startTable(games[0].id) : setMenuOpen((open) => !open))}
            aria-haspopup={single ? undefined : 'menu'}
            aria-expanded={single ? undefined : menuOpen}
            className="flex h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-amber-500 px-3 text-sm font-semibold text-amber-950 transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-[52px] sm:w-auto sm:gap-2 sm:px-6 sm:text-base"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            {busy ? (
              'Opening…'
            ) : (
              <>
                <span className="sm:hidden">New table</span>
                <span className="hidden sm:inline">Start a table</span>
              </>
            )}
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
          <form onSubmit={joinByCode} className="flex w-full items-center gap-2 sm:w-auto">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 sm:h-[52px] sm:flex-none sm:px-4">
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
                className="w-full min-w-0 bg-transparent text-xl font-bold tracking-[0.24em] tabular-nums text-white outline-none placeholder:text-slate-600 sm:w-24"
                placeholder="····"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-11 shrink-0 whitespace-nowrap rounded-xl border border-slate-700 px-4 font-medium transition hover:bg-slate-800 disabled:opacity-60 sm:h-[52px] sm:px-5"
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCodeOpen(true)}
            className="h-11 min-w-0 flex-1 whitespace-nowrap rounded-xl border border-slate-700 px-3 text-sm font-medium transition hover:bg-slate-800 sm:h-[52px] sm:flex-none sm:px-5 sm:text-base"
          >
            <span className="sm:hidden">Join by code</span>
            <span className="hidden sm:inline">Join with a code</span>
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
