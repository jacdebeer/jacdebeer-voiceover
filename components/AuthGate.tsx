import React, { useEffect, useState } from 'react';
import {
  login,
  logout,
  getUser,
  onAuthChange,
  handleAuthCallback,
  acceptInvite,
  AuthError,
  AUTH_EVENTS,
} from '@netlify/identity';

// Invite-only access: there is no sign-up form. Accounts are created from an
// invitation in the Netlify Identity dashboard, and accepted through the link in the email.

// handleAuthCallback reads and clears the URL token, so it must run only once.
let callbackPromise: ReturnType<typeof handleAuthCallback> | null = null;
const getAuthCallback = () => {
  if (!callbackPromise) callbackPromise = handleAuthCallback();
  return callbackPromise;
};

// Identity does not exist when running locally with `npm run dev`.
const AUTH_ENABLED = (import.meta as any).env?.DEV !== true;

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const buttonClass =
  'w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-60';

const Card: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-100 p-6 space-y-4">
      <div>
        <h1 className="text-lg font-extrabold text-slate-800">{title}</h1>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </div>
      {children}
    </div>
  </div>
);

const SignIn: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof AuthError && err.status !== 401 ? err.message : 'Invalid email or password.');
      setBusy(false);
    }
  };

  return (
    <Card title="Sign in" subtitle="Access is by invitation only. Use the email and password from your invitation.">
      <form onSubmit={submit} className="space-y-3">
        <input className={inputClass} type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={inputClass} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button className={buttonClass} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Card>
  );
};

const AcceptInvite: React.FC<{ token: string }> = ({ token }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await acceptInvite(token, password);
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'This invitation is invalid or has expired.');
      setBusy(false);
    }
  };

  return (
    <Card title="Accept your invitation" subtitle="Choose a password to activate your account.">
      <form onSubmit={submit} className="space-y-3">
        <input className={inputClass} type="password" autoComplete="new-password" placeholder="New password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className={inputClass} type="password" autoComplete="new-password" placeholder="Confirm password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button className={buttonClass} type="submit" disabled={busy}>{busy ? 'Activating…' : 'Activate account'}</button>
      </form>
    </Card>
  );
};

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [email, setEmail] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [ready, setReady] = useState(!AUTH_ENABLED);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await getAuthCallback();
        if (result?.type === 'invite' && result.token && !cancelled) setInviteToken(result.token);
      } catch (err) {
        console.error('Auth callback failed:', err);
      }
      try {
        const user = await getUser();
        if (!cancelled) setEmail(user?.email ?? null);
      } catch {
        if (!cancelled) setEmail(null);
      }
      if (!cancelled) setReady(true);
    })();

    const unsubscribe = onAuthChange((event, user) => {
      if (event === AUTH_EVENTS.LOGOUT) setEmail(null);
      else if (user) setEmail(user.email ?? null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!AUTH_ENABLED) return <>{children}</>;
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (inviteToken) return <AcceptInvite token={inviteToken} />;
  if (!email) return <SignIn />;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-none flex items-center justify-end gap-2 bg-white border-b border-slate-200 px-4 py-1 text-[11px] text-slate-600">
        <span className="hidden sm:inline" title={email}>{email}</span>
        <button
          onClick={async () => { await logout(); setEmail(null); }}
          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
        >
          Sign out
        </button>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
};
