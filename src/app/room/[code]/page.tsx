import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogoMark } from "@/components/Logo";
import { SocketRoomClient } from "@/components/SocketRoomClient";
import { titleLabelById } from "@/lib/titles";

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

  // Hold the branded loading screen for a minimum ~2s, overlapped with the
  // queries so it's the floor, not added on top of them.
  const [, room, currentUser] = await Promise.all([
    new Promise((resolve) => setTimeout(resolve, 2000)),
    prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: { players: { select: { id: true, name: true } } },
    }),
    prisma.user.findUnique({
      where: { email: session.user.email },
    }),
  ]);
  if (
    !room ||
    !currentUser ||
    !room.players.some((player) => player.id === currentUser.id)
  ) {
    redirect("/room/join");
  }

  // Resolved from the id alone: whether it was earned was settled when it was
  // saved, so the table needs no stats query to print the words.
  const wearing = titleLabelById(currentUser.title);

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
            className="group flex items-center justify-center select-none"
            aria-label="Dehel Pakad — home"
          >
            <LogoMark className="-my-4 h-24 w-auto transition duration-200 group-hover:scale-105 sm:h-28 lg:h-32" />
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
            playerName={currentUser.username ?? currentUser.name ?? "Player"}
            playerAvatar={currentUser.avatar}
            playerTitle={wearing}
          />
        </div>
      </div>
    </main>
  );
}
