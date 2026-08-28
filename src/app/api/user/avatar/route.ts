import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { isAvatarId } from '@/lib/avatars';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Saves which of the built-in characters a player picked. */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in before picking an avatar.' }, { status: 401 });
  }

  let avatar: unknown;
  try {
    ({ avatar } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Pick an avatar to save.' }, { status: 400 });
  }

  // Only ids from the built-in set are accepted, so nothing arbitrary is stored.
  if (!isAvatarId(avatar)) {
    return NextResponse.json({ error: 'That avatar is not one of the available ones.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Your account could not be found.' }, { status: 401 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatar },
      select: { avatar: true },
    });
    return NextResponse.json({ avatar: updated.avatar });
  } catch (error) {
    console.error('Failed to update avatar', error);
    return NextResponse.json({ error: 'Unable to save your avatar right now.' }, { status: 500 });
  }
}
