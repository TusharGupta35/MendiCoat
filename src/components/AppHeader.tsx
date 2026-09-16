import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { AvatarPicker } from '@/components/AvatarPicker';
import { BrandMark, LogoMark, Wordmark } from '@/components/Logo';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlayerStats } from '@/lib/stats';
import { earnedTitles, titleLabel } from '@/lib/titles';
import type { Level } from '@/lib/progression';

/**
 * The bar at the top of every signed-in page: the mark on the left, and who you
 * are on the right.
 *
 * One component rather than a header per page, so the app has one place a
 * player looks to know where they are and who they are signed in as — and one
 * place to change when that look changes.
 *
 * It reads the session itself rather than being handed a user, so a page can
 * drop it in without plumbing props through. A page that has already worked out
 * the player's level passes it in; that is the whole of the record this bar
 * needs, and it saves the second lookup.
 */
export async function AppHeader({
  level,
  wearing,
  variant = 'full',
  current = 'play',
}: {
  level?: Level;
  /** The title being worn, already checked as earned by the calling page. */
  wearing?: string | null;
  /**
   * 'full' — the mark, the wordmark and who you are, for every page whose
   * identity lives nowhere else.
   *
   * 'slim' — mark, wordmark and the page links only. The dashboard uses this:
   * its left rail already carries the player at full size, and repeating the
   * name and face in a bar above it says the same thing twice.
   */
  variant?: 'full' | 'slim';
  /** Which slim-bar link is the page you are on. Only its styling changes —
   *  every pill stays a real link, so none of them can end up dead. */
  current?: 'play' | 'record' | 'players';
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, username: true, name: true, image: true, avatar: true, title: true },
  });
  if (!user) return null;

  const accountName = user.username ?? user.name ?? session.user.name ?? 'player';

  if (variant === 'slim') {
    return (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:gap-x-4">
        <Link
          href="/dashboard"
          className="group flex items-center gap-3"
          aria-label="Dehel Pakad — all games"
        >
          <LogoMark className="h-14 w-auto shrink-0 drop-shadow-[0_0_18px_rgba(255,194,51,0.25)] transition duration-200 group-hover:scale-105 group-hover:drop-shadow-[0_0_22px_rgba(255,194,51,0.5)] sm:h-16" />
          <Wordmark size="sm" className="hidden sm:flex" />
        </Link>
        {/* Every item is a link, including the current one: styling says
            where you are, but a nav item that is not clickable is just a
            button that does nothing. */}
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex items-center gap-1">
          {(
            [
              { key: 'play', href: '/dashboard', label: 'Play', short: 'Play' },
              // "Your record" is the honest name for the page and too long for
              // a phone, where the bar has to hold three links and a face on
              // one line. The short form is shown, the full one is announced.
              { key: 'record', href: '/stats', label: 'Your record', short: 'Record' },
              { key: 'players', href: '/players', label: 'Players', short: 'Players' },
            ] as const
          ).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === current ? 'page' : undefined}
              className={`relative rounded-full px-3 py-1.5 text-[13px] transition duration-150 sm:px-4 sm:py-2 sm:text-sm ${
                item.key === current
                  ? // The lit pill's hover is the arcade-key press in globals.css
                    // (a.bg-amber-400:hover) — brighter, and up a pixel.
                    'bg-amber-400 font-semibold text-amber-950'
                  : // The old hover was bg-slate-800, which the theme repaints to
                    // a plum a shade off the ground, so it barely showed. A gold
                    // tint, a gold edge and an underline that grows from the
                    // middle make the other two feel like keys too.
                    `font-medium text-slate-400 hover:-translate-y-px hover:bg-amber-400/10 hover:text-amber-200 hover:ring-1 hover:ring-inset hover:ring-amber-300/35 active:translate-y-0 motion-reduce:transform-none
                     after:pointer-events-none after:absolute after:inset-x-4 after:bottom-1 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-amber-300 after:shadow-[0_0_8px_rgba(255,194,51,0.8)] after:transition-transform after:duration-200 after:content-[''] hover:after:scale-x-100`
              }`}
            >
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* The one way to change your face and your name, and the reason it
            is in the bar rather than on the rail's card: the bar is on every
            page, and a setting you can only reach from the dashboard is a
            setting people stop finding. Small enough to read as a control
            next to the links rather than as a second portrait. */}
        <AvatarPicker
          avatar={user.avatar}
          userKey={user.id}
          name={accountName}
          photo={user.image}
          username={user.username}
          size="sm"
        />
        </div>
      </header>
    );
  }


  // Only pages that have not already read the record pay for this. The title
  // has to be re-checked against what was actually earned, so it cannot be
  // taken from the user row alone.
  const record = level ? null : await getPlayerStats(user.id);
  const worn =
    wearing ??
    (record
      ? titleLabel(user.title, earnedTitles(record.milestones, record.feats, record.band.name))
      : null);

  return (
    // Three columns on a wide screen, so the name sits in the middle of the bar
    // however wide the player's own name runs; two on a phone, where the
    // wordmark is not shown at all and the mark and the player take an edge
    // each.
    <header className="app-header-field flex items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:gap-4 sm:p-4">
      {/* No pulling it out of the bar any more. The old artwork carried a wide
          transparent glow, so it needed negative margins to look its size; this
          one is 1.3% margin on the sides and 1.5% on top, so the header's own
          padding is the spacing, equal on the left, the top and the bottom. The
          2px nudge answers the 6% of empty space along the artwork's bottom
          edge, which otherwise leaves it sitting high. */}
      <BrandMark className="h-24 w-auto translate-y-[2px] drop-shadow-[0_0_18px_rgba(255,194,51,0.25)] sm:h-28" />

      <Link href="/dashboard" className="hidden sm:flex sm:justify-center">
        <Wordmark className="flex" />
      </Link>

      {/* The player reads inward from the right — name and title, then the
          face. On a phone it is the same bar, only smaller. */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:flex-none sm:gap-4">
        <div className="min-w-0 text-right">
          {/* Plain text now: changing your name lives behind your own face,
              with the rest of how you appear at the table. */}
          <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
            Welcome back
          </p>
          <h1 className="truncate text-2xl font-semibold leading-tight text-white sm:text-3xl">
            {user.username ?? accountName}
          </h1>
          {worn ? <p className="text-sm font-medium text-amber-300">{worn}</p> : null}
        </div>
        <AvatarPicker
          avatar={user.avatar}
          userKey={user.id}
          name={accountName}
          photo={user.image}
          level={level ?? record?.level}
          username={user.username}
        />
      </div>
    </header>
  );
}
