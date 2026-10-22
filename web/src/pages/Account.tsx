import { KeyRound, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { LanguageSelect } from '../components/LanguagePicker';
import { NotificationsSwitch } from '../components/Notifications';
import { useToast } from '../components/Toast';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, Kv, Ltr, PageHeader } from '../components/ui';
import { errorMessage, post } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { t, tRich } from '../lib/i18n';
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
      toast.success(t('dev.account.twoStepOnToast'));
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
      toast.success(t('dev.account.twoStepOffToast'));
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <PageHeader title={t('dev.account.title')} />
      <div className="space-y-5">
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={user.fullName} size={56} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.fullName}</p>
            <p className="truncate text-sm text-muted">
              <Ltr>@{user.username}</Ltr> ·{' '}
              {user.role === 'developer' ? t('dev.account.appOwner') : t('dev.account.managerAt', { company: user.companyName })}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('dev.account.signIn')} />
          <div className="divide-y divide-line border-t border-line px-5">
            <Kv label={t('dev.account.password')}>
              <Button size="sm" icon={KeyRound} onClick={() => setPwOpen(true)}>
                {t('dev.account.change')}
              </Button>
            </Kv>
            <Kv
              label={
                <span>
                  {t('dev.account.twoStep')}
                  <span className="block text-xs text-faint">{t('dev.account.twoStepHint')}</span>
                </span>
              }
            >
              {user.totpEnabled ? (
                <span className="flex items-center gap-2">
                  <Badge tone="green" dot>
                    {t('common.on')}
                  </Badge>
                  <Button size="sm" variant="ghost" icon={ShieldOff} onClick={() => setDisableOpen(true)}>
                    {t('dev.account.turnOff')}
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="brand" icon={ShieldCheck} loading={busy && !setup} onClick={() => void startSetup()}>
                  {t('dev.account.turnOn')}
                </Button>
              )}
            </Kv>
          </div>
        </Card>

        <Card className="p-5">
          <Field label={t('ui.language.label')} hint={t('ui.language.hint')}>
            <LanguageSelect />
          </Field>
        </Card>

        <Card className="p-5">
          <NotificationsSwitch
            description={user.role === 'developer' ? t('dev.account.notificationsOwner') : t('dev.account.notificationsManager')}
          />
        </Card>

        <Button block size="lg" variant="dangerSoft" icon={LogOut} onClick={() => void logout()}>
          {t('dev.account.signOut')}
        </Button>
      </div>

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title={t('dev.account.changePassword')}>
        <ChangePasswordForm
          onDone={() => {
            setPwOpen(false);
            toast.success(t('dev.account.passwordChanged'));
          }}
        />
      </Dialog>

      <Dialog
        open={!!setup}
        onClose={() => setSetup(null)}
        title={t('dev.account.enableTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="brand" loading={busy} disabled={code.length !== 6} onClick={() => void enable()}>
              {t('dev.account.turnOn')}
            </Button>
          </>
        }
      >
        {setup && (
          <div className="space-y-4 text-sm">
            <p className="text-ink-2">{t('dev.account.step1')}</p>
            <div className="mx-auto w-48 rounded-2xl bg-white p-3 ring-1 ring-line">
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} alt={t('dev.account.qrAlt')} className="w-full" />
            </div>
            <p className="text-center text-xs text-muted">
              {tRich('dev.account.manualKey', { key: <Ltr className="font-mono font-semibold break-all text-ink">{setup.secret}</Ltr> })}
            </p>
            <Field label={t('dev.account.step2')} error={error}>
              <Input
                inputMode="numeric"
                dir="ltr"
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
        title={t('dev.account.disableTitle')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} disabled={!password} onClick={() => void disable()}>
              {t('dev.account.turnOff')}
            </Button>
          </>
        }
      >
        <Field label={t('dev.account.yourPassword')} error={error}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
      </Dialog>
    </div>
  );
}
