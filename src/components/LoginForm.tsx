'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setMessage(null);
    await signIn('google', { callbackUrl: '/dashboard' });
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const response = await signIn('email', {
      email,
      redirect: false,
      callbackUrl: '/dashboard',
    });

    setIsSubmitting(false);
    if (response?.error) {
      setMessage('We could not send a sign-in link. Please check your email configuration and try again.');
      return;
    }

    setMessage('Check your inbox for a secure sign-in link.');
  }

  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting}
        className="w-full rounded-lg bg-amber-500 px-4 py-3 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Continue with Google
      </button>

      <form onSubmit={handleEmailSignIn} className="space-y-3">
        <label className="block text-sm font-medium text-slate-200" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg border border-slate-700 px-4 py-3 font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Continue with Email
        </button>
      </form>

      {message ? <p role="status" className="text-center text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}
