import { LogoMark, Wordmark } from '@/components/Logo';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * The front door.
 *
 * The only page with no bar, so the mark goes big on the same drifting suit
 * field the loading screen uses, and the panel borrows the player card's gold
 * foil edge — the first object anybody sees here is the object the rest of the
 * app is built around.
 */
export default function LoginPage() {
  return (
    <main className="suit-field suit-field-drift flex min-h-screen items-center justify-center px-6 py-10 text-slate-100">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center">
          <LogoMark className="h-28 w-auto drop-shadow-[0_0_32px_rgba(255,194,51,0.35)] sm:h-32" />
          <Wordmark className="mt-2" />
          <p className="mt-2 text-center text-[15px] text-slate-400">
            Five friends, five cities, one table.
          </p>
        </div>

        <div className="mt-7 rounded-[26px] bg-[linear-gradient(160deg,#ffe08a,#e0900c_38%,#7a4a06_62%,#ffd970)] p-[3px] shadow-[0_22px_50px_-26px_rgba(0,0,0,0.95)]">
          <div className="relative overflow-hidden rounded-[23px] bg-[#211539] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.26))] p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(88%_50%_at_50%_0%,rgba(245,166,21,0.2),transparent_64%)]"
            />
            <div className="relative">
              <h1 className="text-center text-[28px] font-semibold text-white">Sign in</h1>
              <p className="mt-1.5 text-center text-sm text-slate-400">
                Pull up a chair. You will need an account to sit at a table.
              </p>

              <LoginForm />
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-[13px] text-slate-500">
          Mendi Coat · Teen Ki Tigdi · three more on the way
        </p>
      </div>
    </main>
  );
}
