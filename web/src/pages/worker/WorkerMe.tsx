import { Download, Info, KeyRound, LogOut, MapPin, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { Avatar, Badge, Button, Card, Kv } from '../../components/ui';
import { useAuth, usePublicConfig, useUser } from '../../lib/auth';
import { NotificationsSwitch } from '../../components/Notifications';
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
        Approved
      </Badge>
    ) : device.state === 'pending' ? (
      <Badge tone="amber" dot>
        Waiting for approval
      </Badge>
    ) : (
      <Badge tone="red" dot>
        Not approved
      </Badge>
    );

  return (
    <div className="animate-fade-up space-y-4">
      <header className="pt-2 pb-1">
        <h1 className="text-[26px] font-semibold tracking-tight">Me</h1>
      </header>

      <Card className="flex items-center gap-4 p-5">
        <Avatar name={user.fullName} size={56} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{user.fullName}</p>
          <p className="truncate text-sm text-muted">
            @{user.username} · {user.companyName}
          </p>
        </div>
      </Card>

      <Card className="divide-y divide-line px-5">
        <Kv label="Phone number">{user.phone || '—'}</Kv>
        <Kv label={<span className="inline-flex items-center gap-1.5"><Smartphone className="size-4" /> This phone</span>}>{deviceBadge}</Kv>
      </Card>

      <Card className="space-y-4 p-5">
        <NotificationsSwitch description="Get a message when your manager asks you to confirm you are at work." />
      </Card>

      <div className="space-y-2">
        {canInstall && (
          <Button block size="lg" icon={Download} onClick={() => void install()}>
            Install the app
          </Button>
        )}
        <Button block size="lg" icon={KeyRound} onClick={() => setPwOpen(true)}>
          Change password
        </Button>
        <Button block size="lg" variant="dangerSoft" icon={LogOut} onClick={() => void logout()}>
          Sign out
        </Button>
      </div>

      <div className="space-y-2 px-1 pt-2 text-[13px] text-muted">
        <p className="flex gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          Your location is only checked when you check in or out, or when your manager asks you to confirm. It is not tracked in the
          background.
        </p>
        <p className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Check-ins only work from this phone. Do not share your password — your manager sees every sign-in from another phone.
        </p>
        <p className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {config?.appName ?? 'OnSite'} {config?.version ? `v${config.version}` : ''}
        </p>
      </div>

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title="Change password">
        <ChangePasswordForm
          onDone={() => {
            setPwOpen(false);
            toast.success('Password changed');
          }}
        />
      </Dialog>
    </div>
  );
}
