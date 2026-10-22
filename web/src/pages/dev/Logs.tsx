import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, LogOut, MapPinned, ScrollText, Search, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  flagInfo,
  REJECT_REASONS,
  type AuditEntry,
  type CompanySummary,
  type LocationSample,
  type Paged,
  type PunchSummary,
  type SecurityEvent,
  type SessionInfo,
  type Site,
  type SystemLog,
} from '../../../../shared/types';
import { Dialog } from '../../components/Dialog';
import { MiniMap } from '../../components/maps';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, cx, EmptyState, ErrorBox, Input, Kv, PageHeader, PageLoader, Select, Switch } from '../../components/ui';
import { get, post, qs } from '../../lib/api';
import { fmtDateTime, fmtDistance, fmtRelative } from '../../lib/format';
import { deviceLabelShort } from './util';

const UTC = 'UTC';

function useCompanies() {
  return useQuery({ queryKey: ['dev', 'companies'], queryFn: () => get<CompanySummary[]>('/api/dev/companies') }).data ?? [];
}

function CompanySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const companies = useCompanies();
  return (
    <Select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-auto" aria-label="Company">
      <option value={0}>All companies</option>
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
        Load more
      </Button>
    </div>
  );
}

function Filters({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

// --- Check-in log ----------------------------------------------------------------------------------

type PunchRow = PunchSummary & { workerName: string; companyName: string; companyId: number };

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
      <PageHeader title="Check-ins" description="Every check-in attempt with the evidence behind the decision. Use it to see why someone could not check in." />
      <Filters>
        <CompanySelect value={companyId} onChange={setCompanyId} />
        <Select value={result} onChange={(e) => setResult(e.target.value)} className="w-auto" aria-label="Result">
          <option value="">All results</option>
          <option value="accepted">Accepted</option>
          <option value="review">For review</option>
          <option value="rejected">Rejected</option>
        </Select>
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : q.isError ? (
          <ErrorBox error={q.error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={MapPinned} title="No check-ins yet" />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((p) => (
              <button key={p.id} onClick={() => setOpen(p)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-surface-2/60">
                <span className="w-36 shrink-0 text-[13px] text-muted">{fmtDateTime(p.at, UTC)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {p.workerName} <span className="font-normal text-muted">· check-{p.type}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {p.companyName}
                    {p.siteName ? ` · ${p.siteName}` : ''}
                    {p.distanceM !== null ? ` · ${fmtDistance(p.distanceM)}` : ''}
                    {p.accuracy !== null ? ` · ±${p.accuracy} m` : ''}
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
  if (punch.result === 'rejected') return <Badge tone="red">{REJECT_REASONS[punch.reason ?? ''] ?? 'Rejected'}</Badge>;
  if (punch.result === 'review') {
    return <Badge tone={punch.reviewStatus === 'pending' ? 'violet' : punch.reviewStatus === 'approved' ? 'green' : 'red'}>{punch.reviewStatus === 'pending' ? 'For review' : punch.reviewStatus === 'approved' ? 'Accepted after review' : 'Rejected after review'}</Badge>;
  }
  return <Badge tone="green">Accepted</Badge>;
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
    <Dialog open={!!punch} onClose={onClose} size="lg" title={punch ? `${punch.workerName} · check-${punch.type}` : ''} description={punch ? `${punch.companyName} · ${fmtDateTime(punch.at, UTC)} UTC` : ''}>
      {!p ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <ResultBadge punch={p} />
            <Badge tone="gray">Risk score {p.riskScore}</Badge>
            {p.networkMatch && <Badge tone="green">Workplace internet</Badge>}
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
              <div className="grid h-56 place-items-center rounded-xl bg-surface-2 text-sm text-muted">No location</div>
            )}
            {p.selfieId && <img src={`/api/selfies/${p.selfieId}`} alt="Selfie" className="h-56 w-full rounded-xl object-cover sm:w-44" />}
          </div>
          <div className="divide-y divide-line rounded-xl bg-surface-2/60 px-4">
            <Kv label="Phone">{p.deviceLabel ?? '—'}</Kv>
            <Kv label="Internet address">{p.ip || '—'}</Kv>
            <Kv label="Phone clock">{p.client.clientTime ? `${Math.round((p.client.clientTime - Date.parse(p.at)) / 1000)} s vs server` : '—'}</Kv>
            <Kv label="Phone time zone">{p.client.tz ?? '—'}</Kv>
            {p.note && <Kv label="Worker’s note">{p.note}</Kv>}
            {p.reviewedByName && <Kv label="Reviewed by">{`${p.reviewedByName}${p.reviewNote ? ` — ${p.reviewNote}` : ''}`}</Kv>}
          </div>
          {p.samples.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">GPS readings ({p.samples.length})</p>
              <div className="max-h-48 overflow-auto rounded-xl ring-1 ring-line">
                <table className="tabular w-full text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-muted">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Latitude</th>
                      <th className="px-3 py-1.5 text-left font-medium">Longitude</th>
                      <th className="px-3 py-1.5 text-right font-medium">± m</th>
                      <th className="px-3 py-1.5 text-right font-medium">Speed</th>
                      <th className="px-3 py-1.5 text-right font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {p.samples.map((s, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1">{s.lat}</td>
                        <td className="px-3 py-1">{s.lng}</td>
                        <td className="px-3 py-1 text-right">{Math.round(s.acc * 10) / 10}</td>
                        <td className="px-3 py-1 text-right">{s.speed ?? '—'}</td>
                        <td className="px-3 py-1 text-right">{p.client.clientTime ? `${Math.round((p.client.clientTime - s.ts) / 100) / 10} s` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {p.client.env && (
            <details className="rounded-xl bg-surface-2/60 px-4 py-2 text-xs">
              <summary className="cursor-pointer py-1 text-sm font-medium">Browser details</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted">{JSON.stringify({ userAgent: p.client.userAgent, ...p.client.env }, null, 2)}</pre>
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
      <PageHeader title="Alerts" description="Suspicious activity, failed sign-ins and blocked check-ins across all companies." />
      <Filters>
        <CompanySelect value={companyId} onChange={setCompanyId} />
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-auto" aria-label="Severity">
          <option value="">All levels</option>
          <option value="high">High</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
        </Select>
        <div className="ml-2">
          <Switch checked={unresolved} onChange={setUnresolved} label="Only unhandled" />
        </div>
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="Nothing here" />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                <ShieldAlert className={cx('mt-0.5 size-4 shrink-0', e.severity === 'high' ? 'text-rose-500' : e.severity === 'warn' ? 'text-amber-500' : 'text-faint')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{e.message}</p>
                  <p className="text-xs text-muted">
                    {fmtDateTime(e.at, UTC)} UTC · {e.companyName ?? 'no company'} · {e.kind}
                    {e.ip ? ` · ${e.ip}` : ''}
                    {e.resolvedAt ? ` · handled by ${e.resolvedByName ?? 'someone'}` : ''}
                  </p>
                </div>
                {!e.resolvedAt && e.severity !== 'info' && (
                  <Button size="xs" variant="ghost" icon={Check} onClick={() => void resolve(e.id)}>
                    Handled
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
      <PageHeader title="Change history" description="Who changed what and when — every approval, correction, new account and setting." />
      <Filters>
        <form
          className="relative w-full sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(search.trim());
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input placeholder="Search (press Enter)" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </form>
        <CompanySelect value={companyId} onChange={setCompanyId} />
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No changes found" />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((a) => (
              <ExpandRow
                key={a.id}
                main={
                  <>
                    <p className="text-sm">{a.summary || a.action}</p>
                    <p className="text-xs text-muted">
                      {fmtDateTime(a.at, UTC)} UTC · {a.actorName} ({a.actorRole}){a.companyName ? ` · ${a.companyName}` : ''}
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
          <button onClick={() => setOpen((o) => !o)} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Details">
            <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {open && details && <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-surface-2 p-3 text-xs whitespace-pre-wrap text-ink-2">{details}</pre>}
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
      if (!id) toast.success(`${res.resolved} marked as resolved`);
      await qc.invalidateQueries({ queryKey: ['dev'] });
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="System log"
        description="Errors from the server, the background jobs and people's browsers. Mark them resolved once fixed."
        actions={
          <Button icon={Check} onClick={() => void resolve()}>
            Resolve all
          </Button>
        }
      />
      <Filters>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-auto" aria-label="Level">
          <option value="error">Errors</option>
          <option value="warn">Warnings</option>
          <option value="info">Info</option>
          <option value="">Everything</option>
        </Select>
        <div className="ml-2">
          <Switch checked={unresolved} onChange={setUnresolved} label="Only unresolved" />
        </div>
      </Filters>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState icon={TriangleAlert} title="No problems logged" body="When something breaks, it shows up here." />
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
                        {fmtDateTime(l.at, UTC)} UTC · {l.source} · {fmtRelative(l.at)}
                        {l.resolvedAt ? ' · resolved' : ''}
                      </p>
                    </div>
                    {!l.resolvedAt && (
                      <Button size="xs" variant="ghost" icon={Check} onClick={() => void resolve(l.id)}>
                        Resolve
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
      toast.success('Signed out');
      await qc.invalidateQueries({ queryKey: ['dev', 'sessions'] });
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <div className="animate-fade-up">
      <PageHeader title="Sessions" description="Who is signed in where. Sign out a session if a phone or computer was lost." />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <PageLoader />
        ) : q.isError ? (
          <ErrorBox error={q.error} />
        ) : q.data.length === 0 ? (
          <EmptyState title="Nobody is signed in" />
        ) : (
          <div className="divide-y divide-line">
            {q.data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.userName} <span className="font-normal text-muted">@{s.username}</span>
                  </p>
                  <p className="truncate text-xs text-muted" title={s.userAgent}>
                    {s.role}
                    {s.companyName ? ` · ${s.companyName}` : ''} · {deviceLabelShort(s.userAgent)} · {s.ip} · active {fmtRelative(s.lastSeenAt)}
                  </p>
                </div>
                <Button size="xs" variant="ghost" icon={LogOut} onClick={() => void revoke(s.id)}>
                  Sign out
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
