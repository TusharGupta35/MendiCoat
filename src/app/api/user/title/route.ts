import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlayerStats } from '@/lib/stats';
import { earnedTitles } from '@/lib/titles';

/**
 * Sets the title a player wears. The list of what they may wear is recomputed
 * here from their own record rather than trusted from the request, so a title
 * cannot be worn without having been earned.
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in before choosing a title.' }, { status: 401 });
  }

  let title: unknown;
  try {
    ({ title } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Choose a title to wear.' }, { status: 400 });
  }
  if (title !== null && typeof title !== 'string') {
    return NextResponse.json({ error: 'Choose a title to wear.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Your account could not be found.' }, { status: 401 });
  }

  if (title !== null) {
    const { milestones, feats, band } = await getPlayerStats(user.id);
    const allowed = earnedTitles(milestones, feats, band.name);
    if (!allowed.some((entry) => entry.id === title)) {
      return NextResponse.json({ error: 'You have not earned that title yet.' }, { status: 403 });
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { title },
      select: { title: true },
    });
    return NextResponse.json({ title: updated.title });
  } catch (error) {
    console.error('Failed to update title', error);
    return NextResponse.json({ error: 'Unable to save your title right now.' }, { status: 500 });
  }
}
