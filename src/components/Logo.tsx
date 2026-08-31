import Image from 'next/image';
import Link from 'next/link';

/**
 * The site's mark and wordmark.
 *
 * The mark is the five friends this was built for — T, N, P, P and H — each on
 * a different piece: a playing card, a chess knight, a pawn, a card again, a
 * die, around a chip in the middle. It is the origin story drawn, and it holds
 * up as the board grows: the pieces already reach past cards, which is where
 * the games are going.
 *
 * The wordmark keeps the split the loading screen already used — "Dehel" plain
 * and "पकड़" lit — so the logo and the splash are recognisably the same brand.
 * Where the two sit relative to each other is the header's business: on a wide
 * screen the name takes the middle of the bar while the mark holds the left.
 */

export function LogoMark({ className = 'h-10 w-auto' }: { className?: string }) {
  return (
    <Image
      // Versioned in the filename. The optimiser caches by URL on disk and so
      // does every browser, so replacing the bytes behind /logo.png left people
      // looking at the old mark after a deploy. A new name is a new cache key.
      src="/logo-v2.png"
      alt=""
      // The artwork is 1239x1269, a shade taller than it is wide. Declaring its
      // real proportions and sizing by height only keeps it from being squashed
      // into a square box; next/image still serves a resized file rather than
      // the megabyte on disk.
      width={1239}
      height={1269}
      priority
      className={`object-contain ${className}`}
    />
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex select-none items-baseline gap-1.5 ${className}`}>
      {/* The phone size only shows up on the front door — the header hides the
          wordmark below sm — so it can be set for a page that has the width. */}
      <span className="text-4xl font-black uppercase tracking-[0.12em] text-white sm:text-5xl sm:tracking-[0.15em]">
        Dehel
      </span>
      <span className="text-4xl font-black text-amber-400 drop-shadow-[0_0_12px_rgba(255,194,51,0.45)] sm:text-5xl">
        पकड़
      </span>
    </span>
  );
}

/**
 * The mark on its own, linking home.
 *
 * Every screen that is not the dashboard or the splash gets this rather than
 * the full lockup: the name is established in those two places, and repeating
 * it on a page that already has its own title just competes with it.
 */
export function BrandMark({ className = 'h-12 w-auto' }: { className?: string }) {
  return (
    <Link href="/dashboard" className="group flex w-fit" aria-label="Dehel Pakad — all games">
      <LogoMark className={`shrink-0 transition duration-200 group-hover:scale-105 ${className}`} />
    </Link>
  );
}
