import { useEffect, useState } from 'react';
import { usePublicConfig } from '../lib/auth';
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
        <p className="text-sm font-medium text-ink">Notifications</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {isIos() && !isStandalone()
            ? 'Add the app to your Home Screen to get notifications on iPhone.'
            : 'This browser cannot show notifications.'}
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
        if (!ok) toast.error('Notifications are blocked. Allow them for this app in your phone settings.');
        else toast.success('Notifications are on');
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

  return <Switch checked={on} onChange={(v) => void toggle(v)} disabled={busy} label="Notifications" description={description} />;
}
