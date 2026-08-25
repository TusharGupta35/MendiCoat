import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Letters, numbers, spaces, underscores and hyphens keep names readable at the table. */
const USERNAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Please sign in before changing your username.' }, { status: 401 });
  }

  let username: unknown;
  try {
    ({ username } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Send a username to save.' }, { status: 400 });
  }

  if (typeof username !== 'string') {
    return NextResponse.json({ error: 'Send a username to save.' }, { status: 400 });
  }

  // Collapse runs of whitespace so "Ace   Of  Spades" cannot masquerade as a distinct name.
  const trimmed = username.trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `Your username must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    return NextResponse.json(
      { error: 'Use only letters, numbers, spaces, underscores and hyphens.' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: 'Your account could not be found.' }, { status: 401 });
  }

  // The unique index is case-sensitive, so "Trump" and "trump" would both fit it.
  // This check keeps the two from coexisting; the index below is still the final word.
  const taken = await prisma.user.findFirst({
    where: { username: { equals: trimmed, mode: 'insensitive' }, NOT: { id: user.id } },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { username: trimmed },
      select: { username: true },
    });
    return NextResponse.json({ username: updated.username });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
    }
    console.error('Failed to update username', error);
    return NextResponse.json({ error: 'Unable to save your username right now.' }, { status: 500 });
  }
}
