import Link from 'next/link';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <h1 className="text-3xl font-semibold text-white">Sign in</h1>
        <p className="mt-2 text-sm text-slate-400">Authenticate with Google or email to create and join rooms.</p>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href="/" className="text-amber-400 hover:underline">
            Back home
          </Link>
        </p>
      </div>
    </main>
  );
}
