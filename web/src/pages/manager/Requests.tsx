import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, Clock3, Pencil, Phone, ShieldAlert, Smartphone, TriangleAlert, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { flagInfo, type ReviewQueue, type SecurityEvent, type TimeEntry } from '../../../../shared/types';
import { useConfirm } from '../../components/Dialog';
import { MiniMap } from '../../components/maps';
import { useToast } from '../../components/Toast';
import { Avatar, Badge, Button, ButtonAnchor, Card, EmptyState, ErrorBox, Notice, PageHeader, PageLoader } from '../../components/ui';
import { fmtDateTime, fmtDistance, fmtRelative, fmtTime, telHref, toLocalInput } from '../../lib/format';
import { useManager } from './context';
import { EntryEditor, type EntryEditorTarget } from './EntryEditor';

const ALERT_TITLES: Record<string, string> = {
  device_conflict: 'Password shared?',
  suspicious_punch: 'Suspicious check-in blocked',
  repeated_rejections: 'Many failed check-ins',
  presence_failed: 'Not at work during presence check',
  presence_expired: 'No answer to presence check',
  bad_signature: 'Tampered request',
  replay: 'Repeated request',
};

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
      <PageHeader title="Requests" description="Things only you can decide. Everything you do here is recorded." />
      {data.total === 0 && (
        <Card>
          <EmptyState icon={CircleCheck} title="All clear" body="No phones to approve, no check-ins to confirm and no warnings. Nice." />
        </Card>
      )}

      <div className="space-y-8">
        {data.devices.length > 0 && (
          <Section title="New phones" count={data.devices.length} description="A worker wants to check in from a different phone. Only approve if you know they changed phones.">
            {data.devices.map((d) => (
              <Card key={d.id} className="p-4 sm:p-5">
                <PersonLine name={d.userName} phone={d.userPhone} meta={`asked ${fmtRelative(d.createdAt)}`} />
                <div className="mt-4 grid gap-3 rounded-xl bg-surface-2/70 p-3 text-sm sm:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <Smartphone className="mt-0.5 size-4 shrink-0 text-brand" />
                    <div>
                      <p className="text-xs text-muted">New phone</p>
                      <p className="font-medium">{d.label}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Smartphone className="mt-0.5 size-4 shrink-0 text-faint" />
                    <div>
                      <p className="text-xs text-muted">Current phone</p>
                      <p className="font-medium">{d.currentDevice ? d.currentDevice.label : 'None'}</p>
                      {d.currentDevice?.lastUsedAt && <p className="text-xs text-muted">last used {fmtRelative(d.currentDevice.lastUsedAt)}</p>}
                    </div>
                  </div>
                </div>
                {d.requestNote && <p className="mt-3 rounded-xl border border-line px-3 py-2 text-sm text-ink-2">“{d.requestNote}”</p>}
                {d.similarTo && (
                  <p className="mt-3 text-[13px] text-muted">
                    Same phone model and settings as {d.similarTo.name}’s phone. That is normal if they simply own the same phone.
                  </p>
                )}
                <p className="mt-3 text-[13px] text-muted">
                  {d.currentDevice ? `Approving stops the old phone (${d.currentDevice.label}) from working.` : 'This will be their phone for check-ins.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="success" icon={Check} onClick={() => run(() => m.post(`/api/m/devices/${d.id}/approve`), 'Phone approved')}>
                    Approve
                  </Button>
                  <Button
                    variant="dangerSoft"
                    icon={X}
                    onClick={async () => {
                      if (await confirm({ title: `Reject this phone for ${d.userName}?`, body: 'They will not be able to check in from it.', confirmText: 'Reject', variant: 'danger' }))
                        run(() => m.post(`/api/m/devices/${d.id}/reject`), 'Phone rejected');
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </Card>
            ))}
          </Section>
        )}

        {data.punches.length > 0 && (
          <Section title="Check-ins to confirm" count={data.punches.length} description="These were recorded, but something needs your decision first.">
            {data.punches.map((p) => {
              const site = m.sites.find((s) => s.name === p.siteName);
              return (
                <Card key={p.id} className="overflow-hidden">
                  <div className="p-4 sm:p-5">
                    <PersonLine name={p.workerName} phone={p.workerPhone} meta={`${p.type === 'in' ? 'Check-in' : 'Check-out'} ${fmtDateTime(p.at, tz)}`} />
                    {p.note && <p className="mt-3 rounded-xl border border-line px-3 py-2 text-sm text-ink-2">“{p.note}”</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.distanceM !== null && p.siteName && (
                        <Badge tone={p.flags.includes('OFF_SITE_REQUEST') ? 'red' : 'gray'}>
                          {p.flags.includes('OFF_SITE_REQUEST') ? `${fmtDistance(p.distanceM)} from ${p.siteName}` : `At ${p.siteName}`}
                        </Badge>
                      )}
                      {p.accuracy !== null && <Badge tone="gray">GPS ±{p.accuracy} m</Badge>}
                      {p.networkMatch && <Badge tone="green">On workplace internet</Badge>}
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
                          <img src={`/api/selfies/${p.selfieId}`} alt={`Photo of ${p.workerName}`} className="h-44 w-32 object-cover" loading="lazy" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2/50 px-4 py-3 sm:px-5">
                    <Button variant="success" icon={Check} onClick={() => run(() => m.post(`/api/m/punches/${p.id}/review`, { decision: 'approve' }), 'Accepted')}>
                      Accept
                    </Button>
                    <Button
                      variant="dangerSoft"
                      icon={X}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Reject this check-in?',
                          body: p.type === 'in' ? 'The attendance is removed and will not count.' : 'The check-out is removed; you can set the right time afterwards.',
                          confirmText: 'Reject',
                          variant: 'danger',
                        });
                        if (ok) run(() => m.post(`/api/m/punches/${p.id}/review`, { decision: 'reject' }), 'Rejected');
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              );
            })}
          </Section>
        )}

        {data.incomplete.length > 0 && (
          <Section title="Forgot to check out" count={data.incomplete.length} description="Set the time they left so their hours are right.">
            {data.incomplete.map((e) => (
              <IncompleteCard
                key={e.id}
                entry={e}
                tz={tz}
                onUseShiftEnd={() =>
                  run(
                    () => m.patch(`/api/m/entries/${e.id}`, { clockOut: toLocalInput(e.shiftEndsAt!, tz), reason: 'Missing check-out: set to the end of the shift' }),
                    'Check-out set to shift end',
                  )
                }
                onEdit={() => setEditor({ mode: 'edit', entryId: e.id, workerName: e.workerName })}
              />
            ))}
          </Section>
        )}

        {data.alerts.length > 0 && (
          <Section title="Warnings" count={data.alerts.length} description="Possible cheating or problems the app noticed.">
            {data.alerts.map((a) => (
              <AlertCard key={a.id} alert={a} tz={tz} onResolve={() => run(() => m.post(`/api/m/alerts/${a.id}/resolve`), 'Marked as handled')} />
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
          Call
        </ButtonAnchor>
      )}
    </div>
  );
}

function IncompleteCard({ entry, tz, onUseShiftEnd, onEdit }: { entry: TimeEntry; tz: string; onUseShiftEnd: () => void; onEdit: () => void }) {
  return (
    <Card className="p-4 sm:p-5">
      <PersonLine name={entry.workerName} meta={`${fmtDateTime(entry.clockInAt, tz)} · ${entry.siteName ?? ''}`} />
      <div className="mt-3 flex items-center gap-2 text-sm text-ink-2">
        <Clock3 className="size-4 text-amber-600" />
        Checked in {fmtTime(entry.clockInAt, tz)}, never checked out
        {entry.shiftEndsAt && ` · shift ended ${fmtTime(entry.shiftEndsAt, tz)}`}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {entry.shiftEndsAt && (
          <Button variant="brand" icon={Check} onClick={onUseShiftEnd}>
            Use shift end ({fmtTime(entry.shiftEndsAt, tz)})
          </Button>
        )}
        <Button icon={Pencil} onClick={onEdit}>
          Set time…
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
          <p className="font-semibold">{ALERT_TITLES[alert.kind] ?? 'Warning'}</p>
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
          Mark as handled
        </Button>
      </div>
    </Card>
  );
}

