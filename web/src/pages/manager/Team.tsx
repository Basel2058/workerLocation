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
  Notice,
  PageHeader,
  PageLoader,
} from '../../components/ui';
import { fmtDateTime, fmtDay, fmtDuration, fmtRelative, fmtTime, localDateOf, telHref, whatsappHref } from '../../lib/format';
import { useManager } from './context';
import { EntryEditor, type EntryEditorTarget } from './EntryEditor';
import { presenceText } from './PersonSheet';

export function deviceBadge(status: Device['status'] | 'none') {
  switch (status) {
    case 'active':
      return <Badge tone="green" dot>Phone approved</Badge>;
    case 'pending':
      return <Badge tone="amber" dot>Waiting for approval</Badge>;
    case 'revoked':
      return <Badge tone="gray">Removed</Badge>;
    case 'rejected':
      return <Badge tone="red">Rejected</Badge>;
    default:
      return <Badge tone="gray">No phone yet</Badge>;
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
      <PageHeader title="Team" description={`${team.data.filter((w) => w.active).length} workers. New accounts are created by the app owner.`} />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Nobody found" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((w) => (
            <Card key={w.id} className={w.active ? '' : 'opacity-60'}>
              <div className="flex items-center gap-3 p-4">
                <ButtonLink to={`${m.base}/team/${w.id}`} variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-3 rounded-xl p-0 text-left hover:bg-transparent">
                  <Avatar name={w.fullName} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{w.fullName}</span>
                    <span className="block truncate text-[13px] font-normal text-muted">
                      {w.lastEntry ? `Last check-in ${fmtRelative(w.lastEntry.clockInAt)}` : 'No check-ins yet'}
                    </span>
                  </span>
                </ButtonLink>
                {w.phone && (
                  <a href={telHref(w.phone)} className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 hover:bg-surface-3" aria-label={`Call ${w.fullName}`}>
                    <Phone className="size-[18px]" />
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
                {deviceBadge(w.device.status)}
                {w.pushEnabled && (
                  <Badge tone="blue" title="Gets notifications">
                    <BellRing className="mr-0.5 inline size-3" /> Alerts on
                  </Badge>
                )}
                {!w.active && <Badge tone="gray">Turned off</Badge>}
                <ButtonLink to={`${m.base}/team/${w.id}`} size="xs" variant="ghost" className="ml-auto">
                  Details <ChevronRight className="size-3.5" />
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
          <ButtonLink to={`${m.base}/team`} variant="ghost" size="sm" icon={ArrowLeft} className="-ml-2 mb-2">
            Team
          </ButtonLink>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={worker.fullName} size={44} />
            {worker.fullName}
          </span>
        }
        description={`@${worker.username}${worker.employeeCode ? ` · ${worker.employeeCode}` : ''}${worker.active ? '' : ' · turned off'}`}
        actions={
          worker.phone ? (
            <>
              <ButtonAnchor href={telHref(worker.phone)} variant="success" icon={Phone}>
                Call {worker.phone}
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
              title={`At work since ${fmtTime(open.clockInAt, tz)}${open.siteName ? ` · ${open.siteName}` : ''}`}
              action={
                presence?.status !== 'pending' ? (
                  <Button size="sm" icon={Radar} loading={action.isPending} onClick={() => action.mutate({ path: '/api/m/presence', body: { workerId: worker.id }, message: 'Asked to confirm location' })}>
                    Ask to confirm location
                  </Button>
                ) : null
              }
            >
              {presence ? presenceText(presence, tz).text : 'You can ask them to prove they are still at the workplace.'}
            </Notice>
          )}

          <Card>
            <CardHeader title="Attendance, last 14 days" actions={<Button size="sm" onClick={() => setEditor({ mode: 'create', workerId: worker.id, workerName: worker.fullName })}>Add</Button>} />
            {recentEntries.length === 0 ? (
              <EmptyState title="No check-ins in the last 14 days" />
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {recentEntries.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-28 shrink-0 text-sm font-medium">{fmtDay(localDateOf(e.clockInAt, tz), { relative: true, tz })}</div>
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-sm">
                        {fmtTime(e.clockInAt, tz)} → {e.clockOutAt ? fmtTime(e.clockOutAt, tz) : e.status === 'open' ? 'now' : '—'}
                        <span className="ml-2 text-muted">{e.minutes !== null ? fmtDuration(e.minutes) : ''}</span>
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {e.lateMinutes !== null && <Badge tone="amber">{fmtDuration(e.lateMinutes)} late</Badge>}
                        {e.status === 'incomplete' && <Badge tone="amber">No check-out</Badge>}
                        {e.needsReview && <Badge tone="violet">To confirm</Badge>}
                        {e.source === 'manual' && <Badge tone="blue">By hand</Badge>}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditor({ mode: 'edit', entryId: e.id, workerName: worker.fullName })}>
                      Fix
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Phone" description="Check-ins only work from an approved phone." />
            <div className="divide-y divide-line border-t border-line">
              {visibleDevices.length === 0 && <p className="px-5 py-4 text-sm text-muted">No phone yet. Their first phone is approved when they sign in.</p>}
              {visibleDevices.map((d) => (
                <div key={d.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Smartphone className="size-5 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.label}</p>
                      <p className="text-xs text-muted">
                        Added {fmtDateTime(d.createdAt, tz)}
                        {d.lastUsedAt ? ` · used ${fmtRelative(d.lastUsedAt)}` : ''}
                      </p>
                    </div>
                    {deviceBadge(d.status)}
                  </div>
                  {d.status === 'active' && (
                    <Button
                      size="xs"
                      variant="dangerSoft"
                      className="mt-2 ml-8"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Remove this phone?',
                          body: `${worker.fullName} can no longer check in with it. Their next phone needs your approval.`,
                          confirmText: 'Remove phone',
                          variant: 'danger',
                        });
                        if (ok) action.mutate({ path: `/api/m/devices/${d.id}/revoke`, message: 'Phone removed' });
                      }}
                    >
                      Remove phone
                    </Button>
                  )}
                  {d.status === 'pending' && (
                    <div className="mt-2 ml-8 flex gap-2">
                      <Button size="xs" variant="success" onClick={() => action.mutate({ path: `/api/m/devices/${d.id}/approve`, message: 'Phone approved' })}>
                        Approve
                      </Button>
                      <Button size="xs" variant="dangerSoft" onClick={() => action.mutate({ path: `/api/m/devices/${d.id}/reject`, message: 'Phone rejected' })}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Next shifts" />
            {upcomingShifts.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-sm text-muted">No shifts planned.</p>
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {upcomingShifts.slice(0, 10).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="font-medium">{fmtDay(s.date, { relative: true, tz })}</span>
                    <span className="tabular text-ink-2">
                      {fmtTime(s.startsAt, tz)}–{fmtTime(s.endsAt, tz)} · {s.siteName}
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
