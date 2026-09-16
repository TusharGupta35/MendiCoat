import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/AppHeader";
import { gameForRoom } from "@/games/registry";
import { GameEmblem } from "@/components/GameEmblem";
import { RoomCode } from "@/components/RoomCode";
import { uiFor } from "@/games/ui";
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

  // No minimum wait — see the note in dashboard/page.tsx. The loading screen
  // shows from the click and for exactly as long as these queries take.
  const [room, currentUser] = await Promise.all([
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

  // A room is a table for one game, and that is what decides which client is
  // rendered here. Rooms made before rooms carried a game fall back to Mendi
  // Coat, which is what they were.
  const game = gameForRoom(room.gameId);
  const { RoomClient } = uiFor(game.id);
  const table = (
    <RoomClient
      roomCode={room.code}
      playerId={currentUser.id}
      playerName={currentUser.username ?? currentUser.name ?? "Player"}
      playerAvatar={currentUser.avatar}
      playerTitle={wearing}
    />
  );

  return (
    <main className="min-h-screen bg-slate-950 px-2 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
      {/* Wider than the other pages' 86rem: the table and its sidebars want the
          room. Everything above the table is the same kit as every other page —
          the slim bar, then a panel that names what you are looking at. */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 sm:gap-5">
        <AppHeader variant="slim" />

        {/* The table's own bar. It used to be a heading inside one big panel
            that wrapped the whole game, which put every game panel inside a
            second panel; the game's panels now sit on the page like the rest
            of the app's. */}
        <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-2xl border border-amber-300/30 bg-slate-900/80 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <GameEmblem game={game} className="h-11 w-11 p-2" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-amber-400">
                {game.name}
              </p>
              <h1 className="truncate text-lg font-semibold text-white sm:text-xl">{room.name}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-3">
              <span className="hidden text-right text-xs leading-tight text-slate-400 sm:block">
                Share this code
                <br />
                to fill the table
              </span>
              <RoomCode code={room.code} />
            </div>
            {/* Back to the game, not to the whole board: leaving a table means
                going where the other tables for this game are. The mark in the
                bar above is the way out to everything else. */}
            <Link
              href={`/games/${game.slug}`}
              className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              ← {game.name}
            </Link>
          </div>
        </header>

        {table}
      </div>
    </main>
  );
}
