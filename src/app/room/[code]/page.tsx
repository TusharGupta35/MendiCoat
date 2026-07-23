import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SocketRoomClient } from "@/components/SocketRoomClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const room = await prisma.room.findUnique({
    where: { code: code.toUpperCase() },
    include: { players: { select: { id: true, name: true } } },
  });
  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (
    !room ||
    !currentUser ||
    !room.players.some((player) => player.id === currentUser.id)
  ) {
    redirect("/room/join");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-2 py-4 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto w-full max-w-[1600px] rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-2xl sm:p-6 lg:p-8">
        <header className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          {/* Left */}
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-amber-400">
              Waiting Room
            </p>

            <h1 className="mt-2 text-3xl font-semibold text-white">
              Room {room.code}
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Share this code: {room.code}
            </p>
          </div>

          {/* Center */}
          <Link
            href="/"
            className="flex items-center justify-center gap-2 text-center select-none"
          >
            <span className="text-3xl font-black uppercase tracking-[0.15em] text-white sm:text-4xl lg:text-5xl">
              Dehel
            </span>

            <span className="text-4xl font-black tracking-normal text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] sm:text-5xl lg:text-6xl">
              पकड़
            </span>
          </Link>

          {/* Right */}
          <div className="flex justify-start lg:justify-end">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-100 transition hover:bg-slate-800"
            >
              Go to Dashboard
            </Link>
          </div>
        </header>

        <div className="mt-8">
          <SocketRoomClient
            roomCode={room.code}
            playerId={currentUser.id}
            playerName={currentUser.name ?? "Player"}
          />
        </div>
      </div>
    </main>
  );
}
