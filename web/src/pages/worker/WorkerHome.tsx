import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Clock3, Fingerprint, LogIn, LogOut, MapPin, ShieldAlert, Smartphone, TriangleAlert } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import type { WorkerHome as HomeData, WorkerShift } from '../../../../shared/types';
import { LogoMark } from '../../components/Logo';
import { Badge, Button, Card, cx, ErrorBox, Notice, Skeleton, Textarea } from '../../components/ui';
import { get } from '../../lib/api';
import { useAuth, useUser } from '../../lib/auth';
import { fmtDay, fmtDuration, fmtFullDate, fmtTime, greeting } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { PunchFlow, type PunchKind } from './PunchFlow';
import { useWorker } from './WorkerApp';

export function useWorkerHome(keyId: string | null) {
  return useQuery({
    queryKey: ['worker-home', keyId],
    queryFn: () => get<HomeData>('/api/worker/home', keyId ? { headers: { 'x-device-key': keyId } } : undefined),
    refetchInterval: 30_000,
  });
}

export function WorkerHome() {
  const user = useUser();
  const { device } = useWorker();
  const home = useWorkerHome(device.keyId);
  const qc = useQueryClient();
  const now = useNow(15_000);
  const [flow, setFlow] = useState<{ kind: PunchKind; presenceId?: number } | null>(null);
  const tz = home.data?.timezone ?? user.timezone;

  const closeFlow = useCallback(
    (changed: boolean) => {
      setFlow(null);
      if (changed) {
        void qc.invalidateQueries({ queryKey: ['worker-home'] });
        void qc.invalidateQueries({ queryKey: ['worker-shifts'] });
        void qc.invalidateQueries({ queryKey: ['worker-history'] });
      }
    },
    [qc],
  );

  const data = home.data;
  const open = data?.openEntry ?? null;
  const ready = device.state === 'active';
  const firstName = user.fullName.split(' ')[0];

  return (
    <div className="animate-fade-up">
      <header className="flex items-center justify-between pt-2 pb-5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{fmtFullDate(new Date(now).toISOString(), tz)}</p>
          <h1 className="mt-0.5 truncate text-[26px] font-semibold tracking-tight">
            {greeting(tz)}, {firstName}
          </h1>
        </div>
        <LogoMark size={36} />
      </header>

      {home.isError && <ErrorBox error={home.error} onRetry={() => void home.refetch()} />}

      <div className="space-y-3">
        {data?.notices.map((n) => (
          <Notice key={n} tone="amber" icon={TriangleAlert}>
            {n}
          </Notice>
        ))}

        {data?.presenceCheck && ready && (
          <PresenceBanner
            expiresAt={data.presenceCheck.expiresAt}
            now={now}
            onConfirm={() => setFlow({ kind: 'presence', presenceId: data.presenceCheck!.id })}
          />
        )}

        <DeviceNotice />

        <Card className="overflow-hidden">
          <div className="px-5 pt-5">
            {!data ? (
              <Skeleton className="h-6 w-48" />
            ) : open ? (
              <StatusLine
                tone="green"
                title={`On site${open.siteName ? ` · ${open.siteName}` : ''}`}
                detail={`Since ${fmtTime(open.clockInAt, tz)} · ${now - Date.parse(open.clockInAt) < 60_000 ? 'just now' : fmtDuration((now - Date.parse(open.clockInAt)) / 60_000)}`}
                badge={open.needsReview ? <Badge tone="amber">Waiting for manager</Badge> : null}
              />
            ) : (
              <StatusLine tone="gray" title="Not checked in" detail={todayLine(data.todayShifts, tz, now)} />
            )}
          </div>

          <div className="flex flex-col items-center px-5 pt-7 pb-6">
            <PunchButton
              kind={open ? 'out' : 'in'}
              disabled={!ready || !data}
              onClick={() => setFlow({ kind: open ? 'out' : 'in' })}
            />
            <p className="mt-5 flex items-center gap-1.5 text-center text-xs text-faint">
              <Fingerprint className="size-3.5" aria-hidden />
              {data?.selfieMode === 'off' ? 'Your location is checked when you tap.' : 'Your location and a quick photo are checked.'}
            </p>
          </div>
        </Card>

        {data && <TodayCard shifts={data.todayShifts} tz={tz} />}

        {data && (
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[13px] text-muted">Next shift</p>
              {data.nextShift ? (
                <>
                  <p className="mt-1 font-semibold">{fmtDay(data.nextShift.date, { relative: true, tz })}</p>
                  <p className="tabular text-sm text-ink-2">
                    {fmtTime(data.nextShift.startsAt, tz)} – {fmtTime(data.nextShift.endsAt, tz)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-faint">None planned</p>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-[13px] text-muted">This week</p>
              <p className="tabular mt-1 text-2xl font-semibold tracking-tight">
                {fmtDuration(data.weekMinutes + (open ? (now - Date.parse(open.clockInAt)) / 60_000 : 0))}
              </p>
            </Card>
          </div>
        )}
      </div>

      {flow && data && (
        <PunchFlow
          kind={flow.kind}
          presenceId={flow.presenceId}
          timezone={tz}
          clockInAt={open?.clockInAt}
          onClose={closeFlow}
        />
      )}
    </div>
  );
}

function todayLine(shifts: WorkerShift[], tz: string, now: number): string {
  const next = shifts.find((s) => Date.parse(s.endsAt) > now);
  if (!next) return shifts.length ? 'Your shifts for today are over.' : 'No shift today.';
  const startsIn = Math.round((Date.parse(next.startsAt) - now) / 60_000);
  if (startsIn > 0) return `Shift starts at ${fmtTime(next.startsAt, tz)}${startsIn <= 90 ? ` (in ${fmtDuration(startsIn)})` : ''}.`;
  return `Your shift started at ${fmtTime(next.startsAt, tz)}.`;
}

function StatusLine({ tone, title, detail, badge }: { tone: 'green' | 'gray'; title: string; detail: string; badge?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="relative mt-1.5 flex size-3 shrink-0">
        {tone === 'green' && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cx('relative size-3 rounded-full', tone === 'green' ? 'bg-emerald-500' : 'bg-slate-400')} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[17px] font-semibold">{title}</p>
          {badge}
        </div>
        <p className="tabular mt-0.5 text-sm text-muted">{detail}</p>
      </div>
    </div>
  );
}

function PunchButton({ kind, disabled, onClick }: { kind: 'in' | 'out'; disabled: boolean; onClick: () => void }) {
  const isIn = kind === 'in';
  const Icon = isIn ? LogIn : LogOut;
  return (
    <div className="relative grid place-items-center">
      {!disabled && isIn && <span className="animate-pulse-ring absolute size-52 rounded-full bg-emerald-400/30" aria-hidden />}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cx(
          'relative grid size-52 place-items-center rounded-full text-white shadow-[0_18px_40px_-12px_rgb(0_0_0/0.35)] transition-transform duration-150 select-none active:scale-[0.97] disabled:opacity-40 disabled:shadow-none',
          isIn
            ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 ring-8 ring-emerald-500/15'
            : 'bg-gradient-to-b from-slate-700 to-slate-900 ring-8 ring-slate-500/15 dark:from-slate-600 dark:to-slate-800',
        )}
      >
        <span className="flex flex-col items-center gap-2">
          <Icon className="size-9" strokeWidth={2.2} aria-hidden />
          <span className="text-[22px] font-semibold tracking-tight">{isIn ? 'Check in' : 'Check out'}</span>
        </span>
      </button>
    </div>
  );
}

function TodayCard({ shifts, tz }: { shifts: WorkerShift[]; tz: string }) {
  if (shifts.length === 0) return null;
  return (
    <Card className="divide-y divide-line">
      {shifts.map((s) => (
        <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Clock3 className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="tabular font-medium">
              Today {fmtTime(s.startsAt, tz)} – {fmtTime(s.endsAt, tz)}
            </p>
            <p className="flex items-center gap-1 truncate text-sm text-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {s.siteName}
              {s.note && ` · ${s.note}`}
            </p>
          </div>
          {s.state === 'worked' && <Badge tone="green">Done</Badge>}
          {s.state === 'missed' && <Badge tone="red">Missed</Badge>}
          {s.state === 'now' && <Badge tone="teal">Now</Badge>}
        </div>
      ))}
    </Card>
  );
}

function PresenceBanner({ expiresAt, now, onConfirm }: { expiresAt: string; now: number; onConfirm: () => void }) {
  const left = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  return (
    <div className="animate-fade-up rounded-2xl bg-amber-400 p-4 text-amber-950 shadow-card">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Your manager asks: are you at work?</p>
          <p className="text-sm opacity-80">Please confirm within {left} min.</p>
        </div>
      </div>
      <Button variant="ink" block className="mt-3" onClick={onConfirm}>
        Yes, confirm my location
      </Button>
    </div>
  );
}

function DeviceNotice() {
  const { device } = useWorker();
  const { logout } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    await device.requestAgain(note.trim());
    setBusy(false);
  };

  switch (device.state) {
    case 'active':
      return null;
    case 'checking':
    case 'registering':
      return (
        <Notice tone="gray" icon={Smartphone} title="Setting up this phone…">
          This only happens once.
        </Notice>
      );
    case 'pending':
      return (
        <Notice tone="amber" icon={Smartphone} title="Waiting for your manager">
          This phone must be approved before you can check in. You will be able to check in as soon as your manager approves it.
        </Notice>
      );
    case 'revoked':
    case 'rejected':
      return (
        <Notice
          tone="red"
          icon={ShieldAlert}
          title={device.state === 'revoked' ? 'This phone was removed from your account' : 'Your manager did not approve this phone'}
          action={
            <div className="space-y-2">
              <Textarea rows={2} placeholder="Message for your manager (for example: I have a new phone)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="ink" size="sm" loading={busy} onClick={() => void ask()}>
                Ask to use this phone
              </Button>
            </div>
          }
        >
          To check in from this phone, ask your manager to approve it again.
        </Notice>
      );
    case 'conflict':
      return (
        <Notice
          tone="red"
          icon={ShieldAlert}
          title="This phone belongs to another worker"
          action={
            <Button variant="ink" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          }
        >
          Every worker must check in with their own phone. Your manager has been told about this sign-in.
        </Notice>
      );
    case 'unsupported':
      return (
        <Notice tone="red" icon={ShieldAlert} title="This browser is not supported">
          Please open the app in Safari (iPhone) or Chrome (Android).
        </Notice>
      );
    default:
      return (
        <Notice tone="red" icon={ShieldAlert} title="Phone setup failed">
          {device.error ?? 'Please try again.'}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void device.register()}>
              Try again
            </Button>
          </div>
        </Notice>
      );
  }
}

