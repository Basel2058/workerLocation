import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellRing, ChevronRight, MessageCircle, Pencil, Phone, Radar, Search, Smartphone, Users } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import type { Device, PresenceCheck, Shift, TeamMember, TimeEntry, UserRecord } from '../../../../shared/types';
import { useConfirm } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  ButtonAnchor,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorBox,
  Input,
  Ltr,
  Notice,
  PageHeader,
  PageLoader,
} from '../../components/ui';
import { fmtDateTime, fmtDay, fmtDuration, fmtRelative, fmtTime, localDateOf, telHref, whatsappHref } from '../../lib/format';
import { t, tRich } from '../../lib/i18n';
import { useManager } from './context';
import { EntryEditor, type EntryEditorTarget } from './EntryEditor';
import { presenceText } from './PersonSheet';

export function deviceBadge(status: Device['status'] | 'none') {
  switch (status) {
    case 'active':
      return (
        <Badge tone="green" dot>
          {t('manager.team.device.active')}
        </Badge>
      );
    case 'pending':
      return (
        <Badge tone="amber" dot>
          {t('manager.team.device.pending')}
        </Badge>
      );
    case 'revoked':
      return <Badge tone="gray">{t('manager.team.device.revoked')}</Badge>;
    case 'rejected':
      return <Badge tone="red">{t('manager.team.device.rejected')}</Badge>;
    default:
      return <Badge tone="gray">{t('manager.team.device.none')}</Badge>;
  }
}

export function TeamPage() {
  const m = useManager();
  const [q, setQ] = useState('');
  const team = useQuery({ queryKey: m.key('team'), queryFn: () => m.get<TeamMember[]>('/api/m/team') });
  if (team.isPending) return <PageLoader />;
  if (team.isError) return <ErrorBox error={team.error} onRetry={() => void team.refetch()} />;
  const list = team.data.filter((w) => `${w.fullName} ${w.username} ${w.phone} ${w.employeeCode}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="animate-fade-up">
      <PageHeader title={t('manager.team.title')} description={t('manager.team.description', { count: team.data.filter((w) => w.active).length })} />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-faint" />
        <Input placeholder={t('manager.team.search')} value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" />
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title={t('manager.team.nobodyFound')} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((w) => (
            <Card key={w.id} className={w.active ? '' : 'opacity-60'}>
              <div className="flex items-center gap-3 p-4">
                <ButtonLink to={`${m.base}/team/${w.id}`} variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-3 rounded-xl p-0 text-start hover:bg-transparent">
                  <Avatar name={w.fullName} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{w.fullName}</span>
                    <span className="block truncate text-[13px] font-normal text-muted">
                      {w.lastEntry ? t('manager.team.lastCheckIn', { time: fmtRelative(w.lastEntry.clockInAt) }) : t('manager.team.noCheckIns')}
                    </span>
                  </span>
                </ButtonLink>
                {w.phone && (
                  <a href={telHref(w.phone)} className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 hover:bg-surface-3" aria-label={t('manager.shared.callName', { name: w.fullName })}>
                    <Phone className="size-[18px]" />
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
                {deviceBadge(w.device.status)}
                {w.pushEnabled && (
                  <Badge tone="blue" title={t('manager.team.notificationsTitle')}>
                    <BellRing className="me-0.5 inline size-3" /> {t('manager.team.alertsOn')}
                  </Badge>
                )}
                {!w.active && <Badge tone="gray">{t('manager.team.turnedOff')}</Badge>}
                <ButtonLink to={`${m.base}/team/${w.id}`} size="xs" variant="ghost" className="ms-auto">
                  {t('manager.team.details')} <ChevronRight className="size-3.5" />
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface WorkerDetail {
  worker: UserRecord;
  devices: Device[];
  recentEntries: TimeEntry[];
  upcomingShifts: Shift[];
  presence: PresenceCheck | null;
}

export function WorkerDetailPage() {
  const m = useManager();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { workerId } = useParams();
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null);
  const q = useQuery({
    queryKey: m.key('worker', workerId),
    queryFn: () => m.get<WorkerDetail>(`/api/m/workers/${workerId}`),
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; message: string }) => m.post(path, body ?? {}),
    onSuccess: async (_d, v) => {
      toast.success(v.message);
      await qc.invalidateQueries({ queryKey: m.key() });
    },
    onError: (err) => toast.error(err),
  });

  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const { worker, devices, recentEntries, upcomingShifts, presence } = q.data;
  const tz = m.tz;
  const open = recentEntries.find((e) => e.status === 'open');
  const visibleDevices = devices.filter((d) => d.status === 'active' || d.status === 'pending').concat(devices.filter((d) => d.status !== 'active' && d.status !== 'pending').slice(0, 3));

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={
          <ButtonLink to={`${m.base}/team`} variant="ghost" size="sm" icon={ArrowLeft} className="-ms-2 mb-2">
            {t('manager.team.title')}
          </ButtonLink>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={worker.fullName} size={44} />
            {worker.fullName}
          </span>
        }
        description={
          <>
            <Ltr>@{worker.username}</Ltr>
            {worker.employeeCode && (
              <>
                {t('common.separator')}
                <Ltr>{worker.employeeCode}</Ltr>
              </>
            )}
            {!worker.active && `${t('common.separator')}${t('manager.team.detail.off')}`}
          </>
        }
        actions={
          worker.phone ? (
            <>
              <ButtonAnchor href={telHref(worker.phone)} variant="success" icon={Phone}>
                {tRich('manager.shared.callPhone', { phone: <Ltr>{worker.phone}</Ltr> })}
              </ButtonAnchor>
              <ButtonAnchor href={whatsappHref(worker.phone)} target="_blank" rel="noreferrer" icon={MessageCircle}>
                WhatsApp
              </ButtonAnchor>
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          {open && (
            <Notice
              tone="green"
              icon={Radar}
              title={[t('manager.team.detail.atWorkSince', { time: fmtTime(open.clockInAt, tz) }), open.siteName].filter(Boolean).join(t('common.separator'))}
              action={
                presence?.status !== 'pending' ? (
                  <Button
                    size="sm"
                    icon={Radar}
                    loading={action.isPending}
                    onClick={() => action.mutate({ path: '/api/m/presence', body: { workerId: worker.id }, message: t('manager.team.detail.presenceAsked') })}
                  >
                    {t('manager.shared.askPresence')}
                  </Button>
                ) : null
              }
            >
              {presence ? presenceText(presence, tz).text : t('manager.team.detail.presenceHint')}
            </Notice>
          )}

          <Card>
            <CardHeader
              title={t('manager.team.detail.recent')}
              actions={
                <Button size="sm" onClick={() => setEditor({ mode: 'create', workerId: worker.id, workerName: worker.fullName })}>
                  {t('manager.team.detail.add')}
                </Button>
              }
            />
            {recentEntries.length === 0 ? (
              <EmptyState title={t('manager.team.detail.noRecent')} />
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {recentEntries.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-28 shrink-0 text-sm font-medium">{fmtDay(localDateOf(e.clockInAt, tz), { relative: true, tz })}</div>
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-sm">
                        {t('common.arrow', {
                          from: fmtTime(e.clockInAt, tz),
                          to: e.clockOutAt ? fmtTime(e.clockOutAt, tz) : e.status === 'open' ? t('common.now') : t('common.empty'),
                        })}
                        <span className="ms-2 text-muted">{e.minutes !== null ? fmtDuration(e.minutes) : ''}</span>
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {e.lateMinutes !== null && <Badge tone="amber">{t('manager.shared.lateBy', { duration: fmtDuration(e.lateMinutes) })}</Badge>}
                        {e.status === 'incomplete' && <Badge tone="amber">{t('manager.shared.noCheckOut')}</Badge>}
                        {e.needsReview && <Badge tone="violet">{t('manager.shared.toConfirm')}</Badge>}
                        {e.source === 'manual' && <Badge tone="blue">{t('manager.team.detail.byHand')}</Badge>}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditor({ mode: 'edit', entryId: e.id, workerName: worker.fullName })}>
                      {t('manager.shared.fix')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t('manager.team.detail.phone')} description={t('manager.team.detail.phoneHint')} />
            <div className="divide-y divide-line border-t border-line">
              {visibleDevices.length === 0 && <p className="px-5 py-4 text-sm text-muted">{t('manager.team.detail.noPhone')}</p>}
              {visibleDevices.map((d) => (
                <div key={d.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Smartphone className="size-5 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.label}</p>
                      <p className="text-xs text-muted">
                        {t('manager.team.detail.deviceAdded', { time: fmtDateTime(d.createdAt, tz) })}
                        {d.lastUsedAt ? `${t('common.separator')}${t('manager.team.detail.deviceUsed', { time: fmtRelative(d.lastUsedAt) })}` : ''}
                      </p>
                    </div>
                    {deviceBadge(d.status)}
                  </div>
                  {d.status === 'active' && (
                    <Button
                      size="xs"
                      variant="dangerSoft"
                      className="mt-2 ms-8"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('manager.team.detail.removeTitle'),
                          body: t('manager.team.detail.removeBody', { name: worker.fullName }),
                          confirmText: t('manager.team.detail.removePhone'),
                          variant: 'danger',
                        });
                        if (ok) action.mutate({ path: `/api/m/devices/${d.id}/revoke`, message: t('manager.team.detail.phoneRemoved') });
                      }}
                    >
                      {t('manager.team.detail.removePhone')}
                    </Button>
                  )}
                  {d.status === 'pending' && (
                    <div className="mt-2 ms-8 flex gap-2">
                      <Button
                        size="xs"
                        variant="success"
                        onClick={() => action.mutate({ path: `/api/m/devices/${d.id}/approve`, message: t('manager.shared.phoneApproved') })}
                      >
                        {t('manager.shared.approve')}
                      </Button>
                      <Button
                        size="xs"
                        variant="dangerSoft"
                        onClick={() => action.mutate({ path: `/api/m/devices/${d.id}/reject`, message: t('manager.shared.phoneRejected') })}
                      >
                        {t('manager.shared.reject')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('manager.team.detail.nextShifts')} />
            {upcomingShifts.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-sm text-muted">{t('manager.team.detail.noShifts')}</p>
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {upcomingShifts.slice(0, 10).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="font-medium">{fmtDay(s.date, { relative: true, tz })}</span>
                    <span className="tabular text-ink-2">
                      {t('common.range', { from: fmtTime(s.startsAt, tz), to: fmtTime(s.endsAt, tz) })}
                      {t('common.separator')}
                      {s.siteName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <EntryEditor
        target={editor}
        onClose={() => {
          setEditor(null);
          void q.refetch();
        }}
      />
    </div>
  );
}
