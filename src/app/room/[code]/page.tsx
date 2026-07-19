import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SocketRoomClient } from '@/components/SocketRoomClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const room = await prisma.room.findUnique({
    where: { code: code.toUpperCase() },
    include: { players: { select: { id: true, name: true } } },
  });
  const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!room || !currentUser || !room.players.some((player) => player.id === currentUser.id)) {
    redirect('/room/join');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.35em] text-amber-400">Waiting room</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Room {room.code}</h1>
        <p className="mt-2 text-sm text-slate-400">Share this code: {room.code}</p>

        <div className="mt-8">
          <SocketRoomClient roomCode={room.code} playerId={currentUser.id} playerName={currentUser.name ?? 'Player'} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-100 transition hover:bg-slate-800">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
