import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
      <div className="max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-10 shadow-2xl">
        <p className="mb-3 text-sm uppercase tracking-[0.35em] text-amber-400">Mendi Coat</p>
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">Real-time multiplayer card game</h1>
        <p className="mt-4 text-lg text-slate-300">
          Create a room, invite four players, and play a server-authoritative Mendi Coat match with live scoring.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/login" className="rounded-lg bg-amber-500 px-6 py-3 font-medium text-slate-950 transition hover:bg-amber-400">
            Sign in
          </Link>
          <Link href="/dashboard" className="rounded-lg border border-slate-700 px-6 py-3 font-medium text-slate-100 transition hover:bg-slate-800">
            Open dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
