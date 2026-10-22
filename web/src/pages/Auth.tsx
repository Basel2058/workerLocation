import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import { LanguageButton } from '../components/LanguagePicker';
import { LogoMark } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';
import { errorMessage, post } from '../lib/api';
import { useAuth, usePublicConfig } from '../lib/auth';
import { t } from '../lib/i18n';

function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: ReactNode }) {
  const config = usePublicConfig();
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_oklab,var(--color-brand)_14%,transparent),transparent)]"
      />
      <LanguageButton className="safe-top absolute end-4 top-4" />
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
      {/* Passwords are typed left-to-right; physical padding keeps room for the eye button on either side. */}
      <Input dir="ltr" {...props} type={show ? 'text' : 'password'} className="pr-11 rtl:pr-3.5 rtl:pl-11 rtl:text-right" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 end-0 grid w-11 place-items-center text-faint hover:text-ink"
        aria-label={show ? t('ui.password.hide') : t('ui.password.show')}
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
    <AuthLayout title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('auth.signIn.username')} htmlFor="username">
          <Input
            id="username"
            name="username"
            dir="ltr"
            className="rtl:text-right"
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
        <Field label={t('auth.signIn.password')} htmlFor="password">
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
          {t('auth.signIn.submit')}
        </Button>
      </form>
      <p className="mt-8 text-center text-[13px] text-faint">{t('auth.signIn.forgot')}</p>
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
    <AuthLayout title={t('auth.code.title')} subtitle={t('auth.code.subtitle')}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          inputMode="numeric"
          dir="ltr"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          placeholder="123 456"
          className="h-14 text-center text-2xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          autoFocus
          aria-label={t('auth.code.label')}
        />
        {error && (
          <p role="alert" className="text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="brand" size="lg" block icon={ShieldCheck} loading={busy} disabled={code.length !== 6}>
          {t('auth.code.verify')}
        </Button>
        <Button variant="ghost" block icon={LogOut} onClick={() => void logout()}>
          {t('auth.code.otherAccount')}
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Password change form, used when a temporary password must be replaced and from account settings. */
export function ChangePasswordForm({ onDone, submitLabel }: { onDone: () => void; submitLabel?: string }) {
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
      <Field label={t('auth.changePassword.current')} htmlFor="pw-current">
        <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label={t('auth.changePassword.new')} htmlFor="pw-new" hint={t('auth.changePassword.newHint')}>
        <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label={t('auth.changePassword.repeat')} htmlFor="pw-repeat" error={mismatch ? t('auth.changePassword.mismatch') : null}>
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
        {submitLabel ?? t('auth.changePassword.submit')}
      </Button>
    </form>
  );
}

export function ForcePasswordChangePage() {
  const { refresh, logout } = useAuth();
  return (
    <AuthLayout title={t('auth.forceChange.title')} subtitle={t('auth.forceChange.subtitle')}>
      <ChangePasswordForm onDone={() => void refresh()} submitLabel={t('auth.forceChange.submit')} />
      <Button variant="ghost" block className="mt-3" onClick={() => void logout()}>
        {t('auth.forceChange.signOut')}
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
