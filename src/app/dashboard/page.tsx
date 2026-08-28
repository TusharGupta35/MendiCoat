import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AvatarPicker } from '@/components/AvatarPicker';
import { CreateRoomButton } from '@/components/CreateRoomButton';
import { DeleteRoomButton } from '@/components/DeleteRoomButton';
import { GameInstructions } from '@/components/GameInstructions';
import { ProgressWatch } from '@/components/ProgressCelebration';
import { RecordCard } from '@/components/StatsPanels';
import { UsernameEditor } from '@/components/UsernameEditor';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { weekOf } from '@/lib/challenges';
import { snapshotFrom } from '@/lib/progress-feed';
import { getPlayerStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // Hold the branded loading screen for a minimum ~2s, overlapped with the
  // query so it's the floor, not added on top of it.
  const [, user] = await Promise.all([
    new Promise((resolve) => setTimeout(resolve, 2000)),
    prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        rooms: {
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: { id: true, name: true, code: true, status: true, hostId: true },
        },
      },
    }),
  ]);
//   const rooms = user?.rooms ?? [];
const rooms: NonNullable<typeof user>['rooms'] = user?.rooms ?? [];
  const accountName = user?.name ?? session.user.name ?? 'player';
  const record = user ? await getPlayerStats(user.id) : null;
  // Built from the stats already loaded, so the celebration costs no extra query.
  const snapshot = record
    ? snapshotFrom(record.level, record.milestones, record.feats, record.challenges, weekOf(new Date()))
    : null;

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            {user ? (
              <AvatarPicker
                avatar={user.avatar}
                userKey={user.id}
                name={user.username ?? accountName}
                photo={user.image}
              />
            ) : null}
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-amber-400">Dashboard</p>
              <UsernameEditor username={user?.username ?? null} fallbackName={accountName} />
            </div>
          </div>
          <div className="flex gap-3">
            <CreateRoomButton />
            <Link href="/room/join" className="rounded-lg border border-slate-700 px-4 py-2 font-medium transition hover:bg-slate-800">
              Join room
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-white">Quick start</h2>
              <p className="mt-2 text-sm text-slate-400">
                Create a game room to invite four players. The room code will be shared with everyone in the match.
              </p>
              <p className="mt-6 text-sm text-slate-400">Create a room to receive a unique 4-character code.</p>
            </div>

            {record ? (
              <RecordCard stats={record.stats} level={record.level} band={record.band} />
            ) : null}

            <GameInstructions />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-white">Recent rooms</h2>
            <div className="mt-4 space-y-3">
              {rooms.length === 0 ? <p className="text-sm text-slate-400">You have not joined any rooms yet.</p> : null}
              {rooms.map((room: {
                            id: string;
                            name: string;
                            code: string;
                            status: string;  
                            hostId: string; 
                          }) => (
                <div key={room.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div>
                    <Link href={`/room/${room.code}`} className="font-medium text-white hover:text-amber-300">{room.name}</Link>
                    <p className="text-sm text-slate-400">{room.code}</p>
                  </div>
                  <div className="flex items-center gap-3">
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

      {snapshot ? <ProgressWatch snapshot={snapshot} /> : null}
    </main>
  );
}
