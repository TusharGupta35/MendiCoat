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
    // No box around it: the code is a piece of text to read out or send on, and
    // a border made it look like a field to type into.
    <button
      type="button"
      onClick={copy}
      title="Copy the room code"
      className="group -m-1 flex items-center gap-2 rounded-lg p-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
    >
      <span className="font-mono text-3xl font-bold leading-none tracking-[0.25em] text-amber-300 transition group-hover:text-amber-200 sm:text-4xl">
        {code}
      </span>
      {copied ? (
        <Check className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy
          className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:text-amber-300"
          aria-hidden="true"
        />
      )}
      <span className="sr-only">{copied ? 'Room code copied' : 'Copy the room code'}</span>
    </button>
  );
}
