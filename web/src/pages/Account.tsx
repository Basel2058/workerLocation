import { KeyRound, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { NotificationsSwitch } from '../components/Notifications';
import { useToast } from '../components/Toast';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, Kv, PageHeader } from '../components/ui';
import { errorMessage, post } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { ChangePasswordForm, PasswordInput } from './Auth';

interface TotpSetup {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
}

/** Account settings for managers and the developer. */
export function AccountPage() {
  const user = useUser();
  const { logout, refresh } = useAuth();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSetup = async () => {
    setBusy(true);
    try {
      setSetup(await post<TotpSetup>('/api/auth/totp/setup'));
      setCode('');
      setError(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/totp/enable', { code });
      setSetup(null);
      toast.success('Two-step sign-in is on');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await post('/api/auth/totp/disable', { password });
      setDisableOpen(false);
      setPassword('');
      toast.success('Two-step sign-in is off');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <PageHeader title="Account" />
      <div className="space-y-5">
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={user.fullName} size={56} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.fullName}</p>
            <p className="truncate text-sm text-muted">
              @{user.username} · {user.role === 'developer' ? 'App owner' : `Manager at ${user.companyName}`}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sign-in" />
          <div className="divide-y divide-line border-t border-line px-5">
            <Kv label="Password">
              <Button size="sm" icon={KeyRound} onClick={() => setPwOpen(true)}>
                Change
              </Button>
            </Kv>
            <Kv
              label={
                <span>
                  Two-step sign-in
                  <span className="block text-xs text-faint">A code from an authenticator app after your password.</span>
                </span>
              }
            >
              {user.totpEnabled ? (
                <span className="flex items-center gap-2">
                  <Badge tone="green" dot>
                    On
                  </Badge>
                  <Button size="sm" variant="ghost" icon={ShieldOff} onClick={() => setDisableOpen(true)}>
                    Turn off
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="brand" icon={ShieldCheck} loading={busy && !setup} onClick={() => void startSetup()}>
                  Turn on
                </Button>
              )}
            </Kv>
          </div>
        </Card>

        <Card className="p-5">
          <NotificationsSwitch
            description={
              user.role === 'developer'
                ? 'Notifications on this device.'
                : 'Get a notification for new phones, check-ins to confirm, failed presence checks and warnings.'
            }
          />
        </Card>

        <Button block size="lg" variant="dangerSoft" icon={LogOut} onClick={() => void logout()}>
          Sign out
        </Button>
      </div>

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title="Change password">
        <ChangePasswordForm
          onDone={() => {
            setPwOpen(false);
            toast.success('Password changed. Other devices were signed out.');
          }}
        />
      </Dialog>

      <Dialog
        open={!!setup}
        onClose={() => setSetup(null)}
        title="Turn on two-step sign-in"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Cancel
            </Button>
            <Button variant="brand" loading={busy} disabled={code.length !== 6} onClick={() => void enable()}>
              Turn on
            </Button>
          </>
        }
      >
        {setup && (
          <div className="space-y-4 text-sm">
            <p className="text-ink-2">
              1. Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and scan this code.
            </p>
            <div className="mx-auto w-48 rounded-2xl bg-white p-3 ring-1 ring-line">
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} alt="QR code for your authenticator app" className="w-full" />
            </div>
            <p className="text-center text-xs text-muted">
              Can’t scan? Enter this key: <span className="font-mono font-semibold break-all text-ink">{setup.secret}</span>
            </p>
            <Field label="2. Enter the 6-digit code from the app" error={error}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-lg tracking-[0.3em]"
              />
            </Field>
          </div>
        )}
      </Dialog>

      <Dialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Turn off two-step sign-in?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} disabled={!password} onClick={() => void disable()}>
              Turn off
            </Button>
          </>
        }
      >
        <Field label="Your password" error={error}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
      </Dialog>
    </div>
  );
}
