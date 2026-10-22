import { useEffect, useState } from 'react';
import { usePublicConfig } from '../lib/auth';
import { t } from '../lib/i18n';
import { currentPushSubscription, disablePush, enablePush, isIos, pushSupported } from '../lib/pwa';
import { isStandalone } from '../lib/device';
import { useToast } from './Toast';
import { Switch } from './ui';

/** Turns push notifications on or off for this phone/browser. */
export function NotificationsSwitch({ description }: { description: string }) {
  const config = usePublicConfig();
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported() && !!config?.pushPublicKey;

  useEffect(() => {
    void currentPushSubscription().then((s) => setOn(!!s && Notification.permission === 'granted'));
  }, []);

  if (!supported) {
    return (
      <div>
        <p className="text-sm font-medium text-ink">{t('ui.notifications.title')}</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {isIos() && !isStandalone()
            ? t('ui.notifications.iphoneHint')
            : t('ui.notifications.unsupported')}
        </p>
      </div>
    );
  }

  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      if (value) {
        const ok = await enablePush(config!.pushPublicKey!);
        setOn(ok);
        if (!ok) toast.error(t('ui.notifications.blocked'));
        else toast.success(t('ui.notifications.enabled'));
      } else {
        await disablePush();
        setOn(false);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return <Switch checked={on} onChange={(v) => void toggle(v)} disabled={busy} label={t('ui.notifications.title')} description={description} />;
}
