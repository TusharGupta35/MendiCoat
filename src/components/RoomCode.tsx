'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/**
 * The room code, and one tap to copy it.
 *
 * The code exists to be sent to three other people, so reading it off the
 * screen and typing it into a chat is the one thing the page should not make
 * anybody do. The letters stay visible either way — a copy button that hides
 * what it copies is no use when the other four are on a call.
 */
export function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused, and the code is on screen regardless.
      setCopied(false);
    }
  }

  return (
    // A gold chip, the same one the table lists print a code in — tinted, never
    // bordered: a border made it look like a field to type into.
    <button
      type="button"
      onClick={copy}
      title="Copy the room code"
      className="group flex items-center gap-2.5 rounded-xl bg-amber-500/15 px-3 py-2 transition hover:bg-amber-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
    >
      <span className="font-display text-2xl font-bold leading-none tracking-[0.18em] tabular-nums text-amber-300 transition group-hover:text-amber-200 sm:text-[26px]">
        {code}
      </span>
      {copied ? (
        <Check className="h-[18px] w-[18px] shrink-0 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy
          className="h-[18px] w-[18px] shrink-0 text-amber-300/60 transition group-hover:text-amber-200"
          aria-hidden="true"
        />
      )}
      <span className="sr-only">{copied ? 'Room code copied' : 'Copy the room code'}</span>
    </button>
  );
}
