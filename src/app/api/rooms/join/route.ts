import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { gameForRoom } from '@/games/registry';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in before joining a room.' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const code = typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : '';
  if (!/^[A-F0-9]{4}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 4-character room code shared by the host.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  const room = await prisma.room.findUnique({
    where: { code },
    include: { players: { select: { id: true } } },
  });

  if (!user || !room) {
    return NextResponse.json({ error: 'That room was not found.' }, { status: 404 });
  }
  if (room.status !== 'LOBBY') {
    return NextResponse.json({ error: 'This game has already started.' }, { status: 409 });
  }
  // How many fit depends on the game the room is a table for: four at Mendi
  // Coat, up to seven at Teen Ki Tigdi.
  const game = gameForRoom(room.gameId);
  if (
    !room.players.some((player: { id: string }) => player.id === user.id) &&
    room.players.length >= game.maxPlayers
  ) {
    return NextResponse.json({ error: 'This room is already full.' }, { status: 409 });
  }

  await prisma.room.update({
    where: { id: room.id },
    data: { players: { connect: { id: user.id } } },
  });

  return NextResponse.json({ code });
}
