import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, LogOut, MapPinned, ScrollText, Search, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  type AuditEntry,
  type CompanySummary,
  type LocationSample,
  type Paged,
  type PunchSummary,
  type PunchType,
  type SecurityEvent,
  type SessionInfo,
  type Site,
  type SystemLog,
} from '../../../../shared/types';
import { Dialog } from '../../components/Dialog';
import { MiniMap } from '../../components/maps';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, EmptyState, ErrorBox, Input, Kv, Ltr, PageHeader, PageLoader, Select, Switch } from '../../components/ui';
import { get, post, qs } from '../../lib/api';
import { fmtDateTime, fmtDistance, fmtNumber, fmtRelative } from '../../lib/format';
import { flagInfo, rejectReason } from '../../lib/flags';
import { t } from '../../lib/i18n';
import { deviceLabelShort, roleLabel } from './util';

const UTC = 'UTC';

function useCompanies() {
  return useQuery({ queryKey: ['dev', 'companies'], queryFn: () => get<CompanySummary[]>('/api/dev/companies') }).data ?? [];
}

function CompanySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const companies = useCompanies();
  return (
    <Select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-auto" aria-label={t('dev.list.company')}>
      <option value={0}>{t('dev.list.allCompanies')}</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

function usePaged<T>(key: unknown[], path: (before: number | undefined) => string) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => get<Paged<T>>(path(pageParam || undefined)),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function LoadMore({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!q.hasNextPage) return null;
  return (
    <div className="flex justify-center p-3">
      <Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
        {t('dev.list.loadMore')}
      </Button>
    </div>
  );
}

function Filters({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

// --- Check-in log ----------------------------------------------------------------------------------

type PunchRow = PunchSummary & { workerName: string; companyName: string; companyId: number };

const punchType = (type: PunchType) => (type === 'in' ? t('dev.punches.in') : t('dev.punches.out'));

export function PunchLogPage() {
  const [companyId, setCompanyId] = useState(0);
  const [result, setResult] = useState('');
  const [open, setOpen] = useState<PunchRow | null>(null);
  const q = usePaged<PunchRow>(['dev', 'punches', companyId, result], (before) =>
    `/api/dev/punches${qs({ companyId: companyId || undefined, result, before })}`,
  );
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="animate-fade-up">
      <PageHeader title={t('dev.punches.title')} description={t('dev.punches.description')} />
      <Filters>
        <CompanySelect value={companyId} onChange={setCompanyId} />
        <Select value={result} onChange={(e) => setResult(e.target.value)} className="w-auto" aria-label={t('dev.punches.result')}>
          <option value="">{t('dev.punches.allResults')}</option>
          <option value="accepted">{t('dev.punches.accepted')}</option>
          <option value="review">{t('dev.punches.forReview')}</option>
          <option value="rejected">{t('dev.punches.rejected')}</option>
        </Select>
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : q.isError ? (
          <ErrorBox error={q.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={MapPinned} title={t('dev.punches.empty')} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((p) => (
              <button key={p.id} onClick={() => setOpen(p)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-start hover:bg-surface-2/60">
                <span className="w-36 shrink-0 text-[13px] text-muted">{fmtDateTime(p.at, UTC)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {p.workerName} <span className="font-normal text-muted">· {punchType(p.type)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {p.companyName}
                    {p.siteName ? ` · ${p.siteName}` : ''}
                    {p.distanceM !== null ? ` · ${fmtDistance(p.distanceM)}` : ''}
                    {p.accuracy !== null ? ` · ±${fmtDistance(p.accuracy)}` : ''}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {p.flags
                    .filter((f) => flagInfo(f).severity !== 'info')
                    .slice(0, 3)
                    .map((f) => (
                      <Badge key={f} tone={flagInfo(f).severity === 'high' ? 'red' : 'amber'}>
                        {flagInfo(f).label}
                      </Badge>
                    ))}
                  <ResultBadge punch={p} />
                </span>
              </button>
            ))}
          </div>
        )}
        <LoadMore q={q} />
      </Card>
      <PunchDetail punch={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ResultBadge({ punch }: { punch: PunchSummary }) {
  if (punch.result === 'rejected') return <Badge tone="red">{rejectReason(punch.reason)}</Badge>;
  if (punch.result === 'review') {
    return (
      <Badge tone={punch.reviewStatus === 'pending' ? 'violet' : punch.reviewStatus === 'approved' ? 'green' : 'red'}>
        {punch.reviewStatus === 'pending'
          ? t('dev.punches.forReview')
          : punch.reviewStatus === 'approved'
            ? t('dev.punches.acceptedAfterReview')
            : t('dev.punches.rejectedAfterReview')}
      </Badge>
    );
  }
  return <Badge tone="green">{t('dev.punches.accepted')}</Badge>;
}

interface PunchFull extends PunchSummary {
  samples: LocationSample[];
  client: { clientTime?: number; tz?: string; userAgent?: string; env?: Record<string, unknown> };
}

function PunchDetail({ punch, onClose }: { punch: PunchRow | null; onClose: () => void }) {
  const full = useQuery({
    queryKey: ['dev', 'punch', punch?.id],
    queryFn: () => get<PunchFull>(`/api/m/punches/${punch!.id}`, { companyId: punch!.companyId }),
    enabled: !!punch,
  });
  const company = useQuery({
    queryKey: ['dev', 'company', punch?.companyId],
    queryFn: () => get<{ sites: Site[] }>(`/api/dev/companies/${punch!.companyId}`),
    enabled: !!punch,
  });
  const site = company.data?.sites.find((s) => s.name === punch?.siteName);
  const p = full.data;
  return (
    <Dialog
      open={!!punch}
      onClose={onClose}
      size="lg"
      title={punch ? `${punch.workerName} · ${punchType(punch.type)}` : ''}
      description={punch ? `${punch.companyName} · ${fmtDateTime(punch.at, UTC)} UTC` : ''}
    >
      {!p ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <ResultBadge punch={p} />
            <Badge tone="gray">{t('dev.punches.riskScore', { score: p.riskScore })}</Badge>
            {p.networkMatch && <Badge tone="green">{t('dev.punches.workplaceInternet')}</Badge>}
          </div>
          {p.flags.length > 0 && (
            <div className="space-y-1.5">
              {p.flags.map((f) => (
                <div key={f} className="flex gap-2 text-sm">
                  <Badge tone={flagInfo(f).severity === 'high' ? 'red' : flagInfo(f).severity === 'warn' ? 'amber' : 'gray'}>{flagInfo(f).label}</Badge>
                  <span className="text-muted">{flagInfo(f).description}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            {p.lat !== null && p.lng !== null ? (
              <MiniMap point={{ lat: p.lat, lng: p.lng, accuracy: p.accuracy }} site={site ? { lat: site.lat, lng: site.lng, radiusM: site.radiusM, name: site.name } : null} className="h-56" />
            ) : (
              <div className="grid h-56 place-items-center rounded-xl bg-surface-2 text-sm text-muted">{t('dev.punches.noLocation')}</div>
            )}
            {p.selfieId && <img src={`/api/selfies/${p.selfieId}`} alt={t('dev.punches.selfie')} className="h-56 w-full rounded-xl object-cover sm:w-44" />}
          </div>
          <div className="divide-y divide-line rounded-xl bg-surface-2/60 px-4">
            <Kv label={t('dev.punches.phone')}>{p.deviceLabel ?? '—'}</Kv>
            <Kv label={t('dev.punches.ip')}>{p.ip ? <Ltr>{p.ip}</Ltr> : '—'}</Kv>
            <Kv label={t('dev.punches.clock')}>
              {p.client.clientTime
                ? t('dev.punches.clockDiff', { seconds: fmtNumber(Math.round((p.client.clientTime - Date.parse(p.at)) / 1000)) })
                : '—'}
            </Kv>
            <Kv label={t('dev.punches.timezone')}>{p.client.tz ? <Ltr>{p.client.tz}</Ltr> : '—'}</Kv>
            {p.note && <Kv label={t('dev.punches.note')}>{p.note}</Kv>}
            {p.reviewedByName && <Kv label={t('dev.punches.reviewedBy')}>{`${p.reviewedByName}${p.reviewNote ? ` — ${p.reviewNote}` : ''}`}</Kv>}
          </div>
          {p.samples.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">{t('dev.punches.readings', { count: p.samples.length })}</p>
              <div className="max-h-48 overflow-auto rounded-xl ring-1 ring-line">
                <table className="tabular w-full text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-muted">
                    <tr>
                      <th className="px-3 py-1.5 text-start font-medium">{t('dev.punches.latitude')}</th>
                      <th className="px-3 py-1.5 text-start font-medium">{t('dev.punches.longitude')}</th>
                      <th className="px-3 py-1.5 text-end font-medium">{t('dev.punches.accuracy')}</th>
                      <th className="px-3 py-1.5 text-end font-medium">{t('dev.punches.speed')}</th>
                      <th className="px-3 py-1.5 text-end font-medium">{t('dev.punches.age')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {p.samples.map((s, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1">
                          <Ltr>{s.lat}</Ltr>
                        </td>
                        <td className="px-3 py-1">
                          <Ltr>{s.lng}</Ltr>
                        </td>
                        <td className="px-3 py-1 text-end">{Math.round(s.acc * 10) / 10}</td>
                        <td className="px-3 py-1 text-end">{s.speed ?? '—'}</td>
                        <td className="px-3 py-1 text-end">
                          {p.client.clientTime ? t('dev.punches.seconds', { seconds: fmtNumber((p.client.clientTime - s.ts) / 1000, 1) }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {p.client.env && (
            <details className="rounded-xl bg-surface-2/60 px-4 py-2 text-xs">
              <summary className="cursor-pointer py-1 text-sm font-medium">{t('dev.punches.browser')}</summary>
              <pre dir="ltr" className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted">
                {JSON.stringify({ userAgent: p.client.userAgent, ...p.client.env }, null, 2)}
              </pre>
              <p className="mt-1 text-muted">{deviceLabelShort(p.client.userAgent ?? '')}</p>
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}

// --- Alerts ------------------------------------------------------------------------------------------

export function AlertsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [companyId, setCompanyId] = useState(0);
  const [severity, setSeverity] = useState('');
  const [unresolved, setUnresolved] = useState(true);
  const q = usePaged<SecurityEvent>(['dev', 'security', companyId, severity, unresolved], (before) =>
    `/api/dev/security${qs({ companyId: companyId || undefined, severity, unresolved, before })}`,
  );
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const resolve = async (id: number) => {
    try {
      await post(`/api/dev/security/${id}/resolve`);
      await qc.invalidateQueries({ queryKey: ['dev'] });
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <div className="animate-fade-up">
      <PageHeader title={t('dev.alerts.title')} description={t('dev.alerts.description')} />
      <Filters>
        <CompanySelect value={companyId} onChange={setCompanyId} />
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-auto" aria-label={t('dev.alerts.severity')}>
          <option value="">{t('dev.alerts.allLevels')}</option>
          <option value="high">{t('dev.alerts.high')}</option>
          <option value="warn">{t('dev.alerts.warn')}</option>
          <option value="info">{t('dev.alerts.info')}</option>
        </Select>
        <div className="ms-2">
          <Switch checked={unresolved} onChange={setUnresolved} label={t('dev.alerts.unhandledOnly')} />
        </div>
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldAlert} title={t('dev.alerts.empty')} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                <ShieldAlert className={cx('mt-0.5 size-4 shrink-0', e.severity === 'high' ? 'text-rose-500' : e.severity === 'warn' ? 'text-amber-500' : 'text-faint')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{e.message}</p>
                  <p className="text-xs text-muted">
                    {fmtDateTime(e.at, UTC)} UTC · {e.companyName ?? t('dev.alerts.noCompany')} · <Ltr>{e.kind}</Ltr>
                    {e.ip && (
                      <>
                        {' · '}
                        <Ltr>{e.ip}</Ltr>
                      </>
                    )}
                    {e.resolvedAt
                      ? ` · ${e.resolvedByName ? t('dev.alerts.handledBy', { name: e.resolvedByName }) : t('dev.alerts.handledBySomeone')}`
                      : ''}
                  </p>
                </div>
                {!e.resolvedAt && e.severity !== 'info' && (
                  <Button size="xs" variant="ghost" icon={Check} onClick={() => void resolve(e.id)}>
                    {t('dev.alerts.handle')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <LoadMore q={q} />
      </Card>
    </div>
  );
}

// --- Audit log --------------------------------------------------------------------------------------------

export function AuditPage() {
  const [companyId, setCompanyId] = useState(0);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const q = usePaged<AuditEntry>(['dev', 'audit', companyId, term], (before) =>
    `/api/dev/audit${qs({ companyId: companyId || undefined, q: term || undefined, before })}`,
  );
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="animate-fade-up">
      <PageHeader title={t('dev.audit.title')} description={t('dev.audit.description')} />
      <Filters>
        <form
          className="relative w-full sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(search.trim());
          }}
        >
          <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-faint" />
          <Input placeholder={t('dev.audit.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" />
        </form>
        <CompanySelect value={companyId} onChange={setCompanyId} />
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title={t('dev.audit.empty')} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((a) => (
              <ExpandRow
                key={a.id}
                main={
                  <>
                    <p className="text-sm">{a.summary || <Ltr>{a.action}</Ltr>}</p>
                    <p className="text-xs text-muted">
                      {fmtDateTime(a.at, UTC)} UTC · {a.actorName} ({roleLabel(a.actorRole)}){a.companyName ? ` · ${a.companyName}` : ''}
                    </p>
                  </>
                }
                details={Object.keys(a.details).length ? JSON.stringify(a.details, null, 2) : null}
              />
            ))}
          </div>
        )}
        <LoadMore q={q} />
      </Card>
    </div>
  );
}

function ExpandRow({ main, details, icon }: { main: ReactNode; details: string | null; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-3">
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0 flex-1">{main}</div>
        {details && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
            aria-label={t('dev.list.details')}
          >
            <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {open && details && (
        <pre dir="ltr" className="mt-2 max-h-80 overflow-auto rounded-xl bg-surface-2 p-3 text-xs whitespace-pre-wrap text-ink-2">
          {details}
        </pre>
      )}
    </div>
  );
}

// --- System log -------------------------------------------------------------------------------------------

export function LogsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [level, setLevel] = useState('error');
  const [unresolved, setUnresolved] = useState(true);
  const q = usePaged<SystemLog>(['dev', 'logs', level, unresolved], (before) => `/api/dev/logs${qs({ level, unresolved, before })}`);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const resolve = async (id?: number) => {
    try {
      const res = await post<{ resolved: number }>('/api/dev/logs/resolve', id ? { id } : {});
      if (!id) toast.success(t('dev.logs.resolvedCount', { count: res.resolved }));
      await qc.invalidateQueries({ queryKey: ['dev'] });
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t('dev.logs.title')}
        description={t('dev.logs.description')}
        actions={
          <Button icon={Check} onClick={() => void resolve()}>
            {t('dev.logs.resolveAll')}
          </Button>
        }
      />
      <Filters>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-auto" aria-label={t('dev.logs.level')}>
          <option value="error">{t('dev.logs.errors')}</option>
          <option value="warn">{t('dev.logs.warnings')}</option>
          <option value="info">{t('dev.logs.info')}</option>
          <option value="">{t('dev.logs.everything')}</option>
        </Select>
        <div className="ms-2">
          <Switch checked={unresolved} onChange={setUnresolved} label={t('dev.logs.unresolvedOnly')} />
        </div>
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={TriangleAlert} title={t('dev.logs.emptyTitle')} body={t('dev.logs.emptyBody')} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((l) => (
              <ExpandRow
                key={l.id}
                icon={<TriangleAlert className={cx('mt-0.5 size-4 shrink-0', l.level === 'error' ? 'text-rose-500' : l.level === 'warn' ? 'text-amber-500' : 'text-faint')} />}
                main={
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm break-words">{l.message}</p>
                      <p className="text-xs text-muted">
                        {fmtDateTime(l.at, UTC)} UTC · <Ltr>{l.source}</Ltr> · {fmtRelative(l.at)}
                        {l.resolvedAt ? ` · ${t('dev.logs.resolved')}` : ''}
                      </p>
                    </div>
                    {!l.resolvedAt && (
                      <Button size="xs" variant="ghost" icon={Check} onClick={() => void resolve(l.id)}>
                        {t('dev.logs.resolve')}
                      </Button>
                    )}
                  </div>
                }
                details={Object.keys(l.details).length ? (typeof l.details.stack === 'string' ? `${l.details.stack}\n\n` : '') + JSON.stringify({ ...l.details, stack: undefined }, null, 2) : null}
              />
            ))}
          </div>
        )}
        <LoadMore q={q} />
      </Card>
    </div>
  );
}

// --- Sessions ---------------------------------------------------------------------------------------------

export function SessionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['dev', 'sessions'], queryFn: () => get<SessionInfo[]>('/api/dev/sessions') });
  const revoke = async (id: string) => {
    try {
      await post(`/api/dev/sessions/${id}/revoke`);
      toast.success(t('dev.sessions.signedOut'));
      await qc.invalidateQueries({ queryKey: ['dev', 'sessions'] });
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <div className="animate-fade-up">
      <PageHeader title={t('dev.sessions.title')} description={t('dev.sessions.description')} />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : q.isError ? (
          <ErrorBox error={q.error} />
        ) : q.data.length === 0 ? (
          <EmptyState title={t('dev.sessions.empty')} />
        ) : (
          <div className="divide-y divide-line">
            {q.data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.userName}{' '}
                    <Ltr className="font-normal text-muted">@{s.username}</Ltr>
                  </p>
                  <p className="truncate text-xs text-muted" title={s.userAgent}>
                    {roleLabel(s.role)}
                    {s.companyName ? ` · ${s.companyName}` : ''} · {deviceLabelShort(s.userAgent)} · <Ltr>{s.ip}</Ltr> ·{' '}
                    {t('dev.sessions.active', { when: fmtRelative(s.lastSeenAt) })}
                  </p>
                </div>
                <Button size="xs" variant="ghost" icon={LogOut} onClick={() => void revoke(s.id)}>
                  {t('dev.sessions.signOut')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
