import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Database, Download, Play, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { DevOverview } from '../../../../shared/types';
import { useToast } from '../../components/Toast';
import { Badge, Button, ButtonLink, Card, CardHeader, cx, ErrorBox, Kv, Ltr, PageHeader, PageLoader, Stat } from '../../components/ui';
import { downloadFile, get, post } from '../../lib/api';
import { fmtBytes, fmtNumber, fmtRelative, fmtUptime } from '../../lib/format';
import { rejectReason } from '../../lib/flags';
import { t } from '../../lib/i18n';
import { PunchChart } from './PunchChart';

function jobName(name: string): string {
  const names: Record<string, string> = {
    attendance: t('dev.overview.jobs.attendance'),
    cleanup: t('dev.overview.jobs.cleanup'),
    integrity: t('dev.overview.jobs.integrity'),
    backup: t('dev.overview.jobs.backup'),
  };
  return names[name] ?? name;
}

export function OverviewPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['dev', 'overview'], queryFn: () => get<DevOverview>('/api/dev/overview'), refetchInterval: 30_000 });
  const runJob = useMutation({
    mutationFn: (name: string) => post(`/api/dev/jobs/${name}/run`),
    onSuccess: () => {
      toast.success(t('dev.overview.jobFinished'));
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
        title={t('dev.overview.title')}
        description={t('dev.overview.description')}
        actions={
          <Button
            icon={Download}
            onClick={() =>
              downloadFile('/api/dev/backup').catch((e) => toast.error(e))
            }
          >
            {t('dev.overview.downloadBackup')}
          </Button>
        }
      />

      <Card className={cx('mb-5 p-5', failing.length ? 'ring-amber-500/40' : '')}>
        <div className="flex items-start gap-3">
          {failing.length ? <CircleAlert className="mt-0.5 size-6 text-amber-500" /> : <CircleCheck className="mt-0.5 size-6 text-emerald-500" />}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{failing.length ? t('dev.overview.needAttention', { count: failing.length }) : t('dev.shell.allNormal')}</p>
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
        <Stat label={t('dev.overview.stats.companies')} value={d.stats.companies} hint={t('dev.overview.stats.workplaces', { count: d.stats.sitesActive })} />
        <Stat label={t('dev.overview.stats.workers')} value={d.stats.workers} hint={t('dev.overview.stats.managers', { count: d.stats.managers })} />
        <Stat label={t('dev.overview.stats.atWork')} value={d.stats.openEntries} tone="green" />
        <Stat
          label={t('dev.overview.stats.punches')}
          value={today.accepted + today.review + today.rejected}
          hint={t('dev.overview.stats.rejected', { count: today.rejected })}
        />
        <Stat label={t('dev.overview.stats.toReview')} value={d.stats.pendingReviews} tone="amber" hint={t('dev.overview.stats.toReviewHint')} />
        <Stat label={t('dev.overview.stats.failedSignIns')} value={d.stats.loginsFailed24h} tone={d.stats.loginsFailed24h > 20 ? 'red' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title={t('dev.overview.chartTitle')} description={t('dev.overview.chartDescription')} />
          <div className="px-5 pb-5">
            <PunchChart data={d.punchesByHour} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dev.overview.rejectTitle')} description={t('dev.overview.last24h')} />
          <div className="px-5 pb-5">
            {d.rejectReasons24h.length === 0 ? (
              <p className="text-sm text-muted">{t('dev.overview.noRejected')}</p>
            ) : (
              <div className="space-y-2.5">
                {d.rejectReasons24h.map((r) => {
                  const max = d.rejectReasons24h[0]!.count;
                  return (
                    <div key={r.reason}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{rejectReason(r.reason)}</span>
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
            <p className="mt-4 text-[13px] text-muted">{t('dev.overview.rejectHint', { example: rejectReason('LOW_ACCURACY') })}</p>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={t('dev.overview.recentErrors')}
            actions={
              <ButtonLink to="/dev/logs" size="sm" variant="ghost">
                {t('common.all')}
              </ButtonLink>
            }
          />
          <div className="divide-y divide-line border-t border-line">
            {d.recentErrors.length === 0 && <p className="px-5 py-4 text-sm text-muted">{t('dev.overview.noErrors')}</p>}
            {d.recentErrors.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.message}</p>
                  <p className="text-xs text-muted">
                    <Ltr>{e.source}</Ltr> · {fmtRelative(e.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={t('dev.overview.recentSecurity')}
            actions={
              <ButtonLink to="/dev/alerts" size="sm" variant="ghost">
                {t('common.all')}
              </ButtonLink>
            }
          />
          <div className="divide-y divide-line border-t border-line">
            {d.recentSecurity.length === 0 && <p className="px-5 py-4 text-sm text-muted">{t('dev.overview.nothingSuspicious')}</p>}
            {d.recentSecurity.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                <ShieldAlert className={cx('mt-0.5 size-4 shrink-0', e.severity === 'high' ? 'text-rose-500' : 'text-amber-500')} />
                <div className="min-w-0">
                  <p className="text-sm">{e.message}</p>
                  <p className="text-xs text-muted">
                    {e.companyName ?? t('dev.overview.noCompany')} · {fmtRelative(e.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title={t('dev.overview.jobsTitle')} description={t('dev.overview.jobsDescription')} />
          <div className="divide-y divide-line border-t border-line">
            {d.jobs.map((j) => (
              <div key={j.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{jobName(j.name)}</p>
                  <p className="truncate text-xs text-muted">
                    {j.lastFinishedAt ? `${fmtRelative(j.lastFinishedAt)} · ${j.lastMessage || t('dev.overview.jobDone')}` : t('dev.overview.notRunYet')}
                  </p>
                </div>
                {j.lastStatus === 'error' ? (
                  <Badge tone="red">{t('dev.overview.jobFailed')}</Badge>
                ) : j.lastStatus === 'ok' ? (
                  <Badge tone="green">{t('dev.overview.jobOk')}</Badge>
                ) : (
                  <Badge tone="gray">{t('dev.overview.jobWaiting')}</Badge>
                )}
                <Button size="sm" variant="ghost" icon={Play} loading={runJob.isPending && runJob.variables === j.name} onClick={() => runJob.mutate(j.name)}>
                  {t('dev.overview.runNow')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('dev.overview.server')} actions={<Database className="size-4 text-muted" />} />
          <div className="divide-y divide-line border-t border-line px-5">
            <Kv label={t('dev.overview.version')}>
              <Ltr>
                {d.system.version} · {d.system.env}
              </Ltr>
            </Kv>
            <Kv label={t('dev.overview.runningFor')}>{fmtUptime(d.system.uptimeSec)}</Kv>
            <Kv label={t('dev.overview.database')}>{fmtBytes(d.system.dbBytes)}</Kv>
            <Kv label={t('dev.overview.photos')}>{fmtBytes(d.system.selfieBytes)}</Kv>
            <Kv label={t('dev.overview.freeDisk')}>{d.system.diskFreeBytes === null ? '—' : fmtBytes(d.system.diskFreeBytes)}</Kv>
            <Kv label={t('dev.overview.memory')}>{fmtBytes(d.system.rssBytes)}</Kv>
            <Kv label={t('dev.overview.requests')}>
              {fmtNumber(d.stats.requests24h.total)} · {t('dev.overview.serverErrors', { count: d.stats.requests24h.errors5xx })}
            </Kv>
            <Kv label={t('dev.overview.node')}>
              <Ltr>{d.system.node}</Ltr>
            </Kv>
          </div>
        </Card>
      </div>
    </div>
  );
}
