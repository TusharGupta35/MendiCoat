import Image from 'next/image';
import Link from 'next/link';

/**
 * The site's mark and wordmark.
 *
 * The mark is the five friends this was built for, sat around a table with a
 * hand of cards in the middle — T, N, P, P and H, one chip each. It is the
 * origin story drawn: the table they lost when they moved apart. Cards because
 * that is what is on the board today; the seats are what still make sense once
 * the board holds games that use none.
 *
 * The wordmark keeps the split the loading screen already used — "Dehel" plain
 * and "पकड़" lit — so the logo and the splash are recognisably the same brand.
 */

export function LogoMark({ className = 'h-10 w-auto' }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      // The artwork is 1312x1199, not square. Declaring its real proportions and
      // sizing by height only keeps it from being squashed into a square box;
      // next/image still serves a resized file rather than the megabyte on disk.
      width={1312}
      height={1199}
      priority
      className={`object-contain ${className}`}
    />
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex select-none items-baseline gap-1.5 ${className}`}>
      <span className="text-xl font-black uppercase tracking-[0.12em] text-white sm:text-3xl sm:tracking-[0.15em]">
        Dehel
      </span>
      <span className="text-2xl font-black text-amber-400 drop-shadow-[0_0_12px_rgba(255,194,51,0.45)] sm:text-4xl">
        पकड़
      </span>
    </span>
  );
}

/**
 * Mark and wordmark on one line, linking home.
 *
 * It belongs inside the page's own header bar rather than floating above it: a
 * lockup of its own, stacked over a card that already carries a name and a
 * face, reads as two headers rather than one.
 */
export function Brand() {
  return (
    <Link href="/dashboard" className="group flex w-fit items-center gap-1 sm:gap-2">
      {/* Big on purpose: the artwork carries a wide glow margin, so a mark
          measured like a tight vector icon renders half the size it looks. The
          negative margin keeps the header bar from growing to match. */}
      <LogoMark className="-my-3 -ml-2 h-20 w-auto shrink-0 drop-shadow-[0_0_18px_rgba(255,194,51,0.25)] transition duration-200 group-hover:scale-105 sm:-ml-3 sm:h-24" />
      <Wordmark />
    </Link>
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
