import Link from 'next/link';
import { JoinRoomForm } from '@/components/JoinRoomForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function JoinRoomPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
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
