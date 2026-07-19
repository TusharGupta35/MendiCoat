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

      {message ? <p role="status" className="text-center text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}
