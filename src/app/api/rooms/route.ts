import { randomBytes } from 'crypto';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function createRoomCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in before creating a room.' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: 'Your account could not be found.' }, { status: 401 });
  }

  // A collision is unlikely, but the database remains the source of truth for uniqueness.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    try {
      const room = await prisma.room.create({
        data: {
          code,
          name: `${session.user.name ?? 'Player'}'s table`,
          hostId: user.id,
          players: { connect: { id: user.id } },
        },
        select: { code: true },
      });
      return NextResponse.json({ code: room.code }, { status: 201 });
    } catch (error) {
      // Prisma's unique-constraint error is deliberately retried; any other error is surfaced below.
      if (!(error instanceof Error) || !error.message.includes('Unique constraint')) {
        console.error('Failed to create room', error);
        return NextResponse.json({ error: 'Unable to create a room right now.' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ error: 'Unable to reserve a unique room code. Please try again.' }, { status: 503 });
}
