import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { OpenTables } from '@/components/OpenTables';
import { liveGames } from '@/games/registry';
import { authOptions } from '@/lib/auth';
import { getTables } from '@/lib/lobby';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Every table, newest first.
 *
 * Three piles, because a table means three different things depending on where
 * you stand with it. Yours are rooms you can simply walk back into — you were
 * let in once and nothing takes that back. Everybody else's are rooms you have
 * to get into: an open one hands you a seat, an invite-only one asks for the
 * code its row deliberately does not print. And below the line sit the rooms
 * nobody has touched in hours, which are not tables so much as leftovers.
 *
 * Nothing here deletes anything — the split is presentation. The only way a
 * room leaves the database is its host deleting it, which is the control the
 * host still has on their own rows.
 */
export default async function TablesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) redirect('/login');

  // Everything, not a page of it: five friends do not generate a second page,
  // and a list you cannot see the bottom of hides exactly the stale rows the
  // split exists to surface.
  const tables = await getTables(user.id, { limit: 200 });

  const openNow = tables.global.filter((table) => table.state !== 'stale');
  const earlier = tables.global.filter((table) => table.state === 'stale');

  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-10 pt-4 text-slate-100 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-5">
        <AppHeader variant="slim" />

        <Link
          href="/dashboard"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-amber-300"
        >
          ← Back to the dashboard
        </Link>

        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-amber-400">Tables</p>
          <h1 className="mt-1.5 text-3xl font-semibold text-white sm:text-4xl">Every table</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Newest first. You are at {tables.mine.length}{' '}
            {tables.mine.length === 1 ? 'table' : 'tables'}; {openNow.length}{' '}
            {openNow.length === 1 ? 'other is' : 'others are'} going right now.
          </p>
        </header>

        <OpenTables
          tables={tables.mine}
          liveGames={liveGames()}
          meId={user.id}
          heading="Your tables"
          blurb="Hosted by you, or sat at by you. No code needed — you are already in these."
          empty={
            <>
              <p className="font-semibold text-slate-200">You are not at a table.</p>
              <p className="mt-1 text-sm text-slate-400">
                Start one above, or join with a code somebody sent you.
              </p>
            </>
          }
        />

        <OpenTables
          tables={openNow}
          liveGames={liveGames()}
          meId={user.id}
          heading="Open now"
          actions={false}
          blurb="Everybody else's tables. Joining one takes the code its host sent you."
          empty={<p className="text-sm text-slate-400">Nobody else has a table open right now.</p>}
        />

        {earlier.length > 0 ? (
          <OpenTables
            tables={earlier}
            liveGames={liveGames()}
            meId={user.id}
            heading="Left open"
            actions={false}
            blurb="Nobody has touched these in hours. They still exist — a host can delete their own."
          />
        ) : null}
      </div>
    </main>
  );
}
