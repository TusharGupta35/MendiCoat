'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, LogOut, Menu, TrendingUp, X } from 'lucide-react';

/**
 * The header's menu button.
 *
 * Everywhere a player can go, in one place. It exists because there was no way
 * to sign out at all — the only navigation was whatever link happened to be on
 * the page you were already looking at.
 */

const LINKS = [
  { href: '/dashboard', label: 'Games', icon: LayoutGrid },
  { href: '/stats', label: 'Your stats', icon: TrendingUp },
] as const;

export function HeaderMenu({ className = '' }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    // A click anywhere else is a decision not to use the menu.
    function onPointerDown(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node)) setIsOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={menu} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close the menu' : 'Open the menu'}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/60 text-slate-300 transition hover:border-amber-400/50 hover:text-amber-300 sm:h-12 sm:w-12"
      >
        {isOpen ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-amber-300"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center gap-3 border-t border-slate-800 px-4 py-3 text-left text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
