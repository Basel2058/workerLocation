import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import { LogoMark } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';
import { errorMessage, post } from '../lib/api';
import { useAuth, usePublicConfig } from '../lib/auth';

function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: ReactNode }) {
  const config = usePublicConfig();
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_oklab,var(--color-brand)_14%,transparent),transparent)]"
      />
      <div className="animate-fade-up w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={52} className="drop-shadow-sm" />
          <p className="mt-3 text-sm font-medium text-muted">{config?.appName ?? 'OnSite'}</p>
          <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PasswordInput(props: ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint hover:text-ink"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Use the username and password you were given.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Username" htmlFor="username">
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        <Button type="submit" variant="brand" size="lg" block loading={busy} disabled={!username || !password}>
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-center text-[13px] text-faint">Forgot your password? Ask your manager to reset it.</p>
    </AuthLayout>
  );
}

export function CodePage() {
  const { verifyCode, logout } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(code);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Two-step sign-in" subtitle="Enter the 6-digit code from your authenticator app.">
      <form onSubmit={submit} className="space-y-4">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          placeholder="123 456"
          className="h-14 text-center text-2xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          autoFocus
          aria-label="Verification code"
        />
        {error && (
          <p role="alert" className="text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="brand" size="lg" block icon={ShieldCheck} loading={busy} disabled={code.length !== 6}>
          Verify
        </Button>
        <Button variant="ghost" block icon={LogOut} onClick={() => void logout()}>
          Use another account
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Password change form, used when a temporary password must be replaced and from account settings. */
export function ChangePasswordForm({ onDone, submitLabel = 'Save new password' }: { onDone: () => void; submitLabel?: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = repeat.length > 0 && next !== repeat;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return;
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Current password" htmlFor="pw-current">
        <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 8 characters. A short sentence is easy to remember.">
        <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Repeat new password" htmlFor="pw-repeat" error={mismatch ? 'The passwords do not match.' : null}>
        <PasswordInput id="pw-repeat" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="brand"
        size="lg"
        block
        icon={KeyRound}
        loading={busy}
        disabled={!current || next.length < 8 || next !== repeat}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

export function ForcePasswordChangePage() {
  const { refresh, logout } = useAuth();
  return (
    <AuthLayout title="Choose your password" subtitle="Replace the temporary password with one only you know.">
      <ChangePasswordForm onDone={() => void refresh()} submitLabel="Save and continue" />
      <Button variant="ghost" block className="mt-3" onClick={() => void logout()}>
        Sign out
      </Button>
    </AuthLayout>
  );
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <LogoMark size={48} className="animate-pulse" />
    </div>
  );
}
