import { Download, Info, KeyRound, LogOut, MapPin, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { LanguageSelect } from '../../components/LanguagePicker';
import { useToast } from '../../components/Toast';
import { Avatar, Badge, Button, Card, Kv, Ltr } from '../../components/ui';
import { useAuth, usePublicConfig, useUser } from '../../lib/auth';
import { NotificationsSwitch } from '../../components/Notifications';
import { t } from '../../lib/i18n';
import { useInstallPrompt } from '../../lib/pwa';
import { ChangePasswordForm } from '../Auth';
import { useWorker } from './WorkerApp';

export function WorkerMe() {
  const user = useUser();
  const { logout } = useAuth();
  const { device } = useWorker();
  const config = usePublicConfig();
  const toast = useToast();
  const { canInstall, install } = useInstallPrompt();
  const [pwOpen, setPwOpen] = useState(false);

  const deviceBadge =
    device.state === 'active' ? (
      <Badge tone="green" dot>
        {t('worker.me.approved')}
      </Badge>
    ) : device.state === 'pending' ? (
      <Badge tone="amber" dot>
        {t('worker.me.waitingForApproval')}
      </Badge>
    ) : (
      <Badge tone="red" dot>
        {t('worker.me.notApproved')}
      </Badge>
    );
  const appName = config?.appName ?? 'OnSite';

  return (
    <div className="animate-fade-up space-y-4">
      <header className="pt-2 pb-1">
        <h1 className="text-[26px] font-semibold tracking-tight">{t('worker.me.title')}</h1>
      </header>

      <Card className="flex items-center gap-4 p-5">
        <Avatar name={user.fullName} size={56} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{user.fullName}</p>
          <p className="truncate text-sm text-muted">
            <Ltr>@{user.username}</Ltr>
            {t('common.separator')}
            {user.companyName}
          </p>
        </div>
      </Card>

      <Card className="divide-y divide-line px-5">
        <Kv label={t('worker.me.phoneNumber')}>{user.phone ? <Ltr>{user.phone}</Ltr> : t('common.empty')}</Kv>
        <Kv label={<span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" /> {t('worker.me.thisPhone')}</span>}>{deviceBadge}</Kv>
      </Card>

      <Card className="space-y-4 p-5">
        <NotificationsSwitch description={t('worker.me.notifications')} />
      </Card>

      <Card className="space-y-3 p-5">
        <div>
          <label htmlFor="worker-language" className="text-sm font-medium text-ink">
            {t('ui.language.label')}
          </label>
          <p className="mt-0.5 text-[13px] text-muted">{t('ui.language.hint')}</p>
        </div>
        <LanguageSelect id="worker-language" />
      </Card>

      <div className="space-y-2">
        {canInstall && (
          <Button block size="lg" icon={Download} onClick={() => void install()}>
            {t('worker.me.install')}
          </Button>
        )}
        <Button block size="lg" icon={KeyRound} onClick={() => setPwOpen(true)}>
          {t('worker.me.changePassword')}
        </Button>
        <Button block size="lg" variant="dangerSoft" icon={LogOut} onClick={() => void logout()}>
          {t('ui.shell.signOut')}
        </Button>
      </div>

      <div className="space-y-2 px-1 pt-2 text-[13px] text-muted">
        <p className="flex gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('worker.me.locationPrivacy')}
        </p>
        <p className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('worker.me.phonePrivacy')}
        </p>
        <p className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {config?.version ? t('worker.me.appVersion', { app: appName, version: config.version }) : appName}
        </p>
      </div>

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title={t('worker.me.changePassword')}>
        <ChangePasswordForm
          onDone={() => {
            setPwOpen(false);
            toast.success(t('worker.me.passwordChanged'));
          }}
        />
      </Dialog>
    </div>
  );
}
