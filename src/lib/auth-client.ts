export type AuthProvider = 'google' | 'email';

export interface AppUser {
  name: string;
  email: string;
  provider: AuthProvider;
}

const STORAGE_KEY = 'mendi-coat-user';

export function getStoredUser(): AppUser | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function saveUser(user: AppUser) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function signInDemo(provider: AuthProvider, name: string, email: string) {
  const resolvedName = name.trim() || (provider === 'google' ? 'Google Player' : 'Email Player');
  const resolvedEmail = email.trim() || `${provider}@example.com`;

  const user: AppUser = {
    name: resolvedName,
    email: resolvedEmail,
    provider,
  };

  saveUser(user);
  return user;
}
