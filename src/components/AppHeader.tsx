import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { AvatarPicker } from '@/components/AvatarPicker';
import { BrandMark, Wordmark } from '@/components/Logo';
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
}: {
  level?: Level;
  /** The title being worn, already checked as earned by the calling page. */
  wearing?: string | null;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, username: true, name: true, image: true, avatar: true, title: true },
  });
  if (!user) return null;

  const accountName = user.username ?? user.name ?? session.user.name ?? 'player';

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
    <header className="app-header-field flex items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 sm:grid sm:grid-cols-[auto_1fr_auto] sm:gap-4 sm:px-6 sm:py-3">
      <BrandMark className="-my-4 -ml-3 h-24 w-auto translate-y-1 drop-shadow-[0_0_18px_rgba(255,194,51,0.25)] sm:h-28 sm:translate-y-1.5" />

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
