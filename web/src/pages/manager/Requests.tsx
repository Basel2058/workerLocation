import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, Clock3, Pencil, Phone, ShieldAlert, Smartphone, TriangleAlert, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ReviewQueue, SecurityEvent, TimeEntry } from '../../../../shared/types';
import { useConfirm } from '../../components/Dialog';
import { MiniMap } from '../../components/maps';
import { useToast } from '../../components/Toast';
import { Avatar, Badge, Button, ButtonAnchor, Card, EmptyState, ErrorBox, Notice, PageHeader, PageLoader } from '../../components/ui';
import { fmtDateTime, fmtDistance, fmtRelative, fmtTime, telHref, toLocalInput } from '../../lib/format';
import { flagInfo } from '../../lib/flags';
import { t, tRich } from '../../lib/i18n';
import { useManager } from './context';
import { EntryEditor, type EntryEditorTarget } from './EntryEditor';

function alertTitle(kind: string): string {
  switch (kind) {
    case 'device_conflict':
      return t('manager.requests.alerts.passwordShared');
    case 'suspicious_punch':
      return t('manager.requests.alerts.suspiciousPunch');
    case 'repeated_rejections':
      return t('manager.requests.alerts.repeatedRejections');
    case 'presence_failed':
      return t('manager.requests.alerts.presenceFailed');
    case 'presence_expired':
      return t('manager.requests.alerts.presenceExpired');
    case 'bad_signature':
      return t('manager.requests.alerts.badSignature');
    case 'replay':
      return t('manager.requests.alerts.replay');
    default:
      return t('manager.requests.alerts.warning');
  }
}

export function RequestsPage() {
  const m = useManager();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null);
  const q = useQuery({ queryKey: m.key('reviews'), queryFn: () => m.get<ReviewQueue>('/api/m/reviews'), refetchInterval: 30_000 });

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: m.key() });
    },
    onError: (err) => toast.error(err),
  });
  const run = (fn: () => Promise<unknown>, message: string) =>
    act.mutate(fn, { onSuccess: () => toast.success(message) });

  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const data = q.data;
  const tz = m.tz;

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('manager.requests.title')} description={t('manager.requests.description')} />
      {data.total === 0 && (
        <Card>
          <EmptyState icon={CircleCheck} title={t('manager.requests.allClear')} body={t('manager.requests.allClearBody')} />
        </Card>
      )}

      <div className="space-y-8">
        {data.devices.length > 0 && (
          <Section title={t('manager.requests.devices.title')} count={data.devices.length} description={t('manager.requests.devices.description')}>
            {data.devices.map((d) => (
              <Card key={d.id} className="p-4 sm:p-5">
                <PersonLine name={d.userName} phone={d.userPhone} meta={t('manager.requests.devices.asked', { time: fmtRelative(d.createdAt) })} />
                <div className="mt-4 grid gap-3 rounded-xl bg-surface-2/70 p-3 text-sm sm:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <Smartphone className="mt-0.5 size-4 shrink-0 text-brand" />
                    <div>
                      <p className="text-xs text-muted">{t('manager.requests.devices.newPhone')}</p>
                      <p className="font-medium">{d.label}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Smartphone className="mt-0.5 size-4 shrink-0 text-faint" />
                    <div>
                      <p className="text-xs text-muted">{t('manager.requests.devices.currentPhone')}</p>
                      <p className="font-medium">{d.currentDevice ? d.currentDevice.label : t('manager.requests.devices.noCurrentPhone')}</p>
                      {d.currentDevice?.lastUsedAt && (
                        <p className="text-xs text-muted">{t('manager.requests.devices.lastUsed', { time: fmtRelative(d.currentDevice.lastUsedAt) })}</p>
                      )}
                    </div>
                  </div>
                </div>
                {d.requestNote && <p className="mt-3 rounded-xl border border-line px-3 py-2 text-sm text-ink-2">{t('manager.shared.quote', { text: d.requestNote })}</p>}
                {d.similarTo && (
                  <p className="mt-3 text-[13px] text-muted">{t('manager.requests.devices.similar', { name: d.similarTo.name })}</p>
                )}
                <p className="mt-3 text-[13px] text-muted">
                  {d.currentDevice
                    ? t('manager.requests.devices.replaces', { label: d.currentDevice.label })
                    : t('manager.requests.devices.firstPhone')}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="success" icon={Check} onClick={() => run(() => m.post(`/api/m/devices/${d.id}/approve`), t('manager.shared.phoneApproved'))}>
                    {t('manager.shared.approve')}
                  </Button>
                  <Button
                    variant="dangerSoft"
                    icon={X}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('manager.requests.devices.rejectTitle', { name: d.userName }),
                        body: t('manager.requests.devices.rejectBody'),
                        confirmText: t('manager.shared.reject'),
                        variant: 'danger',
                      });
                      if (ok) run(() => m.post(`/api/m/devices/${d.id}/reject`), t('manager.shared.phoneRejected'));
                    }}
                  >
                    {t('manager.shared.reject')}
                  </Button>
                </div>
              </Card>
            ))}
          </Section>
        )}

        {data.punches.length > 0 && (
          <Section title={t('manager.requests.punches.title')} count={data.punches.length} description={t('manager.requests.punches.description')}>
            {data.punches.map((p) => {
              const site = m.sites.find((s) => s.name === p.siteName);
              return (
                <Card key={p.id} className="overflow-hidden">
                  <div className="p-4 sm:p-5">
                    <PersonLine
                      name={p.workerName}
                      phone={p.workerPhone}
                      meta={t(p.type === 'in' ? 'manager.requests.punches.checkInAt' : 'manager.requests.punches.checkOutAt', { time: fmtDateTime(p.at, tz) })}
                    />
                    {p.note && <p className="mt-3 rounded-xl border border-line px-3 py-2 text-sm text-ink-2">{t('manager.shared.quote', { text: p.note })}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.distanceM !== null && p.siteName && (
                        <Badge tone={p.flags.includes('OFF_SITE_REQUEST') ? 'red' : 'gray'}>
                          {p.flags.includes('OFF_SITE_REQUEST')
                            ? t('manager.requests.punches.distanceFrom', { distance: fmtDistance(p.distanceM), site: p.siteName })
                            : t('manager.requests.punches.atSite', { site: p.siteName })}
                        </Badge>
                      )}
                      {p.accuracy !== null && (
                        <Badge tone="gray">
                          {/* Isolated so "±11 m" stays together after the Latin "GPS" in right-to-left languages. */}
                          {tRich('manager.requests.punches.gpsAccuracy', {
                            accuracy: <bdi>{t('manager.person.accuracy', { distance: fmtDistance(p.accuracy) })}</bdi>,
                          })}
                        </Badge>
                      )}
                      {p.networkMatch && <Badge tone="green">{t('manager.requests.punches.workplaceInternet')}</Badge>}
                    </div>
                    {p.flags.filter((f) => f !== 'OFF_SITE_REQUEST').length > 0 && (
                      <div className="mt-3 space-y-2">
                        {p.flags
                          .filter((f) => f !== 'OFF_SITE_REQUEST' && flagInfo(f).severity !== 'info')
                          .map((f) => (
                            <Notice key={f} tone={flagInfo(f).severity === 'high' ? 'red' : 'amber'} icon={TriangleAlert} title={flagInfo(f).label}>
                              {flagInfo(f).description}
                            </Notice>
                          ))}
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                      {p.lat !== null && p.lng !== null ? (
                        <MiniMap
                          point={{ lat: p.lat, lng: p.lng, accuracy: p.accuracy }}
                          site={site ? { lat: site.lat, lng: site.lng, radiusM: site.radiusM, name: site.name } : null}
                          className="h-44"
                        />
                      ) : (
                        <div />
                      )}
                      {p.selfieId && (
                        <a href={`/api/selfies/${p.selfieId}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl ring-1 ring-line">
                          <img src={`/api/selfies/${p.selfieId}`} alt={t('manager.shared.photoOf', { name: p.workerName })} className="h-44 w-32 object-cover" loading="lazy" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2/50 px-4 py-3 sm:px-5">
                    <Button
                      variant="success"
                      icon={Check}
                      onClick={() => run(() => m.post(`/api/m/punches/${p.id}/review`, { decision: 'approve' }), t('manager.requests.punches.accepted'))}
                    >
                      {t('manager.requests.punches.accept')}
                    </Button>
                    <Button
                      variant="dangerSoft"
                      icon={X}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('manager.requests.punches.rejectTitle'),
                          body: t(p.type === 'in' ? 'manager.requests.punches.rejectInBody' : 'manager.requests.punches.rejectOutBody'),
                          confirmText: t('manager.shared.reject'),
                          variant: 'danger',
                        });
                        if (ok) run(() => m.post(`/api/m/punches/${p.id}/review`, { decision: 'reject' }), t('manager.requests.punches.rejected'));
                      }}
                    >
                      {t('manager.shared.reject')}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </Section>
        )}

        {data.incomplete.length > 0 && (
          <Section title={t('manager.requests.incomplete.title')} count={data.incomplete.length} description={t('manager.requests.incomplete.description')}>
            {data.incomplete.map((e) => (
              <IncompleteCard
                key={e.id}
                entry={e}
                tz={tz}
                onUseShiftEnd={() =>
                  run(
                    () => m.patch(`/api/m/entries/${e.id}`, { clockOut: toLocalInput(e.shiftEndsAt!, tz), reason: t('manager.requests.incomplete.autoReason') }),
                    t('manager.requests.incomplete.setToShiftEnd'),
                  )
                }
                onEdit={() => setEditor({ mode: 'edit', entryId: e.id, workerName: e.workerName })}
              />
            ))}
          </Section>
        )}

        {data.alerts.length > 0 && (
          <Section title={t('manager.requests.alerts.title')} count={data.alerts.length} description={t('manager.requests.alerts.description')}>
            {data.alerts.map((a) => (
              <AlertCard key={a.id} alert={a} tz={tz} onResolve={() => run(() => m.post(`/api/m/alerts/${a.id}/resolve`), t('manager.requests.alerts.handled'))} />
            ))}
          </Section>
        )}
      </div>

      <EntryEditor target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}


function Section({ title, count, description, children }: { title: string; count: number; description: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 px-1">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold">
          {title}
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-ink-2">{count}</span>
        </h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{children}</div>
    </section>
  );
}

function PersonLine({ name, phone, meta }: { name: string; phone?: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-[13px] text-muted">{meta}</p>
      </div>
      {phone && (
        <ButtonAnchor href={telHref(phone)} size="sm" variant="secondary" icon={Phone}>
          {t('common.call')}
        </ButtonAnchor>
      )}
    </div>
  );
}

function IncompleteCard({ entry, tz, onUseShiftEnd, onEdit }: { entry: TimeEntry; tz: string; onUseShiftEnd: () => void; onEdit: () => void }) {
  return (
    <Card className="p-4 sm:p-5">
      <PersonLine
        name={entry.workerName}
        meta={entry.siteName ? t('manager.shared.withSite', { text: fmtDateTime(entry.clockInAt, tz), site: entry.siteName }) : fmtDateTime(entry.clockInAt, tz)}
      />
      <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
        <Clock3 className="size-4 shrink-0 text-amber-600" />
        {entry.shiftEndsAt
          ? t('manager.requests.incomplete.textShiftEnded', { time: fmtTime(entry.clockInAt, tz), end: fmtTime(entry.shiftEndsAt, tz) })
          : t('manager.requests.incomplete.text', { time: fmtTime(entry.clockInAt, tz) })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {entry.shiftEndsAt && (
          <Button variant="brand" icon={Check} onClick={onUseShiftEnd}>
            {t('manager.requests.incomplete.useShiftEnd', { time: fmtTime(entry.shiftEndsAt, tz) })}
          </Button>
        )}
        <Button icon={Pencil} onClick={onEdit}>
          {t('manager.requests.incomplete.setTime')}
        </Button>
      </div>
    </Card>
  );
}

function AlertCard({ alert, tz, onResolve }: { alert: SecurityEvent; tz: string; onResolve: () => void }) {
  const high = alert.severity === 'high';
  const flags = Array.isArray(alert.details.flags) ? (alert.details.flags as string[]) : [];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${high ? 'bg-rose-500/12 text-rose-600' : 'bg-amber-500/15 text-amber-700'}`}>
          {high ? <ShieldAlert className="size-5" /> : <TriangleAlert className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{alertTitle(alert.kind)}</p>
          <p className="mt-0.5 text-sm text-ink-2">{alert.message}</p>
          <p className="mt-1 text-xs text-muted">{fmtDateTime(alert.at, tz)}</p>
          {flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <Badge key={f} tone={flagInfo(f).severity === 'high' ? 'red' : 'amber'} title={flagInfo(f).description}>
                  {flagInfo(f).label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" icon={Check} onClick={onResolve}>
          {t('manager.requests.alerts.markHandled')}
        </Button>
      </div>
    </Card>
  );
}

