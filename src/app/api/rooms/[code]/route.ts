import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { closeSocketRoom } from '@/lib/room-registry';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in before deleting a room.' }, { status: 401 });
  }

  const { code } = await params;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  const room = await prisma.room.findUnique({ where: { code: code.toUpperCase() } });

  if (!user || !room) {
    return NextResponse.json({ error: 'That room was not found.' }, { status: 404 });
  }
  if (room.hostId !== user.id) {
    return NextResponse.json({ error: 'Only the room host can delete this room.' }, { status: 403 });
  }

  await prisma.room.delete({ where: { id: room.id } });
  // A room keeps its seats and its match until it is deleted, so the live state
  // has to go with the row. Otherwise anyone still at the table plays on in a
  // room that no longer exists, and a code issued again later would inherit it.
  closeSocketRoom(room.code);
  return NextResponse.json({ ok: true });
}
