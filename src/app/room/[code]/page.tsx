import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/AppHeader";
import { RoomCode } from "@/components/RoomCode";
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
    <main className="min-h-screen bg-slate-950 px-2 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 lg:px-8">
      <div className="mx-auto mb-4 w-full max-w-[1600px]">
        <AppHeader />
      </div>

      <div className="mx-auto w-full max-w-[1600px] rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-2xl sm:px-6 sm:py-3 lg:px-7 lg:py-3">
        <header>
          {/* The label and the way out share the top line; the code and what to
              do with it share the one below, where the code is the thing being
              read. */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-400 sm:text-sm">
              Waiting room
            </p>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-100 transition hover:bg-slate-800"
            >
              Go to Dashboard
            </Link>
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <RoomCode code={room.code} />
            <span className="text-sm text-slate-400">Share this code to fill the table</span>
          </div>
        </header>

        <div className="mt-3 sm:mt-4">
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
