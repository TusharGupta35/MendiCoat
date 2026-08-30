import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { JoinRoomForm } from '@/components/JoinRoomForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function JoinRoomPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-3 pb-8 pt-4 sm:px-6 sm:pb-12 sm:pt-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
        <AppHeader />
      </div>
      <div className="mx-auto mt-8 w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <h1 className="text-3xl font-semibold text-white">Join a room</h1>
        <p className="mt-2 text-sm text-slate-400">Enter a room code shared by the host.</p>

        <JoinRoomForm />

        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href="/dashboard" className="text-amber-400 hover:underline">
            Back to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
