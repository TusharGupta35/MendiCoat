import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProgressSnapshot } from '@/lib/stats';

/**
 * The current progress snapshot for the signed-in player. The game table calls
 * this the moment a match ends, which is when a level-up actually means
 * something — the page it was dealt from is long since rendered.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'Unknown player.' }, { status: 404 });

  return NextResponse.json(await getProgressSnapshot(user.id));
}
