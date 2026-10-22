import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Database, Download, Play, ShieldAlert, TriangleAlert } from 'lucide-react';
import { REJECT_REASONS, type DevOverview } from '../../../../shared/types';
import { useToast } from '../../components/Toast';
import { Badge, Button, ButtonLink, Card, CardHeader, cx, ErrorBox, Kv, PageHeader, PageLoader, Stat } from '../../components/ui';
import { downloadFile, get, post } from '../../lib/api';
import { fmtBytes, fmtRelative, fmtUptime, plural } from '../../lib/format';
import { PunchChart } from './PunchChart';

const JOB_NAMES: Record<string, string> = {
  attendance: 'Missing check-outs & presence checks',
  cleanup: 'Clean-up (old photos, sessions, logs)',
  integrity: 'Database health check',
  backup: 'Daily backup',
};

export function OverviewPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['dev', 'overview'], queryFn: () => get<DevOverview>('/api/dev/overview'), refetchInterval: 30_000 });
  const runJob = useMutation({
    mutationFn: (name: string) => post(`/api/dev/jobs/${name}/run`),
    onSuccess: () => {
      toast.success('Job finished');
      void qc.invalidateQueries({ queryKey: ['dev', 'overview'] });
    },
    onError: (e) => toast.error(e),
  });

  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const failing = d.checks.filter((c) => !c.ok);
  const today = d.stats.punchesToday;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Overview"
        description="Is everything working? Health, activity and problems across all companies."
        actions={
          <Button
            icon={Download}
            onClick={() =>
              downloadFile('/api/dev/backup').catch((e) => toast.error(e))
            }
          >
            Download backup
          </Button>
        }
      />

      <Card className={cx('mb-5 p-5', failing.length ? 'ring-amber-500/40' : '')}>
        <div className="flex items-start gap-3">
          {failing.length ? <CircleAlert className="mt-0.5 size-6 text-amber-500" /> : <CircleCheck className="mt-0.5 size-6 text-emerald-500" />}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{failing.length ? `${failing.length} thing${failing.length === 1 ? '' : 's'} need attention` : 'All systems normal'}</p>
            <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {d.checks.map((c) => (
                <div key={c.name} className="flex items-start gap-2 text-sm">
                  {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />}
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-[13px] text-muted">{c.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Companies" value={d.stats.companies} hint={plural(d.stats.sitesActive, 'workplace')} />
        <Stat label="Workers" value={d.stats.workers} hint={plural(d.stats.managers, 'manager')} />
        <Stat label="At work now" value={d.stats.openEntries} tone="green" />
        <Stat label="Check-ins, 24 h" value={today.accepted + today.review + today.rejected} hint={`${today.rejected} rejected`} />
        <Stat label="To review" value={d.stats.pendingReviews} tone="amber" hint="waiting for managers" />
        <Stat label="Failed sign-ins, 24 h" value={d.stats.loginsFailed24h} tone={d.stats.loginsFailed24h > 20 ? 'red' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Check-ins per hour" description="Last 24 hours, all companies" />
          <div className="px-5 pb-5">
            <PunchChart data={d.punchesByHour} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Why check-ins were rejected" description="Last 24 hours" />
          <div className="px-5 pb-5">
            {d.rejectReasons24h.length === 0 ? (
              <p className="text-sm text-muted">No rejected check-ins.</p>
            ) : (
              <div className="space-y-2.5">
                {d.rejectReasons24h.map((r) => {
                  const max = d.rejectReasons24h[0]!.count;
                  return (
                    <div key={r.reason}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{REJECT_REASONS[r.reason] ?? r.reason}</span>
                        <span className="tabular font-medium">{r.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-[#d03b3b]" style={{ width: `${(r.count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-[13px] text-muted">A sudden jump in one reason (for example "GPS not precise enough") can mean a phone or browser update broke something.</p>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recent errors" actions={<ButtonLink to="/dev/logs" size="sm" variant="ghost">All</ButtonLink>} />
          <div className="divide-y divide-line border-t border-line">
            {d.recentErrors.length === 0 && <p className="px-5 py-4 text-sm text-muted">No unresolved errors.</p>}
            {d.recentErrors.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.message}</p>
                  <p className="text-xs text-muted">
                    {e.source} · {fmtRelative(e.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent security events" actions={<ButtonLink to="/dev/alerts" size="sm" variant="ghost">All</ButtonLink>} />
          <div className="divide-y divide-line border-t border-line">
            {d.recentSecurity.length === 0 && <p className="px-5 py-4 text-sm text-muted">Nothing suspicious.</p>}
            {d.recentSecurity.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                <ShieldAlert className={cx('mt-0.5 size-4 shrink-0', e.severity === 'high' ? 'text-rose-500' : 'text-amber-500')} />
                <div className="min-w-0">
                  <p className="text-sm">{e.message}</p>
                  <p className="text-xs text-muted">
                    {e.companyName ?? 'No company'} · {fmtRelative(e.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title="Background jobs" description="They run by themselves; you can also start one now." />
          <div className="divide-y divide-line border-t border-line">
            {d.jobs.map((j) => (
              <div key={j.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{JOB_NAMES[j.name] ?? j.name}</p>
                  <p className="truncate text-xs text-muted">
                    {j.lastFinishedAt ? `${fmtRelative(j.lastFinishedAt)} · ${j.lastMessage || 'done'}` : 'Not run yet'}
                  </p>
                </div>
                {j.lastStatus === 'error' ? <Badge tone="red">Failed</Badge> : j.lastStatus === 'ok' ? <Badge tone="green">OK</Badge> : <Badge tone="gray">Waiting</Badge>}
                <Button size="sm" variant="ghost" icon={Play} loading={runJob.isPending && runJob.variables === j.name} onClick={() => runJob.mutate(j.name)}>
                  Run now
                </Button>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Server" actions={<Database className="size-4 text-muted" />} />
          <div className="divide-y divide-line border-t border-line px-5">
            <Kv label="Version">
              {d.system.version} · {d.system.env}
            </Kv>
            <Kv label="Running for">{fmtUptime(d.system.uptimeSec)}</Kv>
            <Kv label="Database">{fmtBytes(d.system.dbBytes)}</Kv>
            <Kv label="Photos">{fmtBytes(d.system.selfieBytes)}</Kv>
            <Kv label="Free disk">{d.system.diskFreeBytes === null ? '—' : fmtBytes(d.system.diskFreeBytes)}</Kv>
            <Kv label="Memory">{fmtBytes(d.system.rssBytes)}</Kv>
            <Kv label="Requests, 24 h">
              {d.stats.requests24h.total.toLocaleString()} · {d.stats.requests24h.errors5xx} errors
            </Kv>
            <Kv label="Node.js">{d.system.node}</Kv>
          </div>
        </Card>
      </div>
    </div>
  );
}
