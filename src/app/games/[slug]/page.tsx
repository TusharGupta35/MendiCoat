import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { CreateRoomButton } from '@/components/CreateRoomButton';
import { DeleteRoomButton } from '@/components/DeleteRoomButton';
import { GameEmblem } from '@/components/GameEmblem';
import { GameInstructions } from '@/components/GameInstructions';
import { BrandMark } from '@/components/Logo';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { gameBySlug } from '@/lib/games';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * One game's own page: how it is played, and the rooms it is played in.
 *
 * Everything here is particular to a single game, which is why it is not on the
 * dashboard. The dashboard answers "what shall I play"; this answers "how does
 * this one go, and where is the table".
 */
export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = gameBySlug(slug);
  if (!game) notFound();
  // A game that is not built yet has no rules to read and no room to sit in;
  // its tile on the dashboard is the whole of it for now.
  if (game.status !== 'live') notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      rooms: {
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { id: true, name: true, code: true, status: true, hostId: true },
      },
    },
  });
  const rooms = user?.rooms ?? [];

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <BrandMark className="-my-3 -ml-2 h-20 w-auto" />
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800"
            >
              All games
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <GameEmblem game={game} size="lg" />
              <div>
                <h1 className="text-3xl font-semibold text-white">{game.name}</h1>
                <p className="text-sm text-amber-300">{game.tagline}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                  {game.players}
                  {game.bots ? ' · bots available' : ' · needs a full table'}
                </p>
              </div>
            </div>
          </div>

          <p className="mt-4 max-w-2xl text-sm text-slate-400">{game.blurb}</p>

          <div className="mt-5 flex flex-wrap items-start gap-3">
            <CreateRoomButton />
            <Link
              href="/room/join"
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800"
            >
              Join room
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <GameInstructions />

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-white">Your rooms</h2>
            <div className="mt-4 space-y-3">
              {rooms.length === 0 ? (
                <p className="text-sm text-slate-400">
                  You have not joined any rooms yet. Create one and share the code.
                </p>
              ) : null}
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/room/${room.code}`}
                      className="truncate font-medium text-white hover:text-amber-300"
                    >
                      {room.name}
                    </Link>
                    <p className="text-sm text-slate-400">{room.code}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                      {room.status}
                    </span>
                    {room.hostId === user?.id ? <DeleteRoomButton roomCode={room.code} /> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
