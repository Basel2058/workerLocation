import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Inbox, List, Map as MapIcon, Phone, RefreshCw, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { LiveResponse, LiveRow, LiveStatus } from '../../../../shared/types';
import { LiveMap } from '../../components/maps';
import { Avatar, Badge, ButtonLink, Card, cx, EmptyState, ErrorBox, IconButton, PageLoader, Segmented, Select, Stat, toneDot } from '../../components/ui';
import { qs } from '../../lib/api';
import { fmtFullDate, fmtRelative, telHref } from '../../lib/format';
import { useIsDesktop, useNow, usePageVisible, useStoredState } from '../../lib/hooks';
import { t, tRich } from '../../lib/i18n';
import { useManager } from './context';
import { PersonSheet } from './PersonSheet';
import { shiftLine, STATUS_TONE, statusBadge, statusDetail } from './status';

type Filter = 'all' | 'on_site' | 'missing' | 'late_arrivals' | 'upcoming' | 'checked_out';

function groups(): Array<{ title: string; statuses: LiveStatus[] }> {
  return [
    { title: t('manager.live.groups.notArrived'), statuses: ['late'] },
    { title: t('manager.live.groups.forgotCheckout'), statuses: ['missing_checkout'] },
    { title: t('manager.live.groups.onSite'), statuses: ['on_site'] },
    { title: t('manager.live.groups.comingLater'), statuses: ['upcoming'] },
    { title: t('manager.live.groups.absent'), statuses: ['absent'] },
    { title: t('manager.live.groups.checkedOut'), statuses: ['checked_out'] },
  ];
}

function matches(row: LiveRow, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'missing':
      return row.status === 'late' || row.status === 'absent';
    case 'late_arrivals':
      return row.lateMinutes !== null && row.status !== 'late' && row.status !== 'absent';
    default:
      return row.status === filter;
  }
}

export function LivePage() {
  const m = useManager();
  const [siteId, setSiteId] = useStoredState<number>(`onsite.live.site.${m.companyId ?? 0}`, 0);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const visible = usePageVisible();
  const isDesktop = useIsDesktop();
  const now = useNow(5_000);

  const live = useQuery({
    queryKey: m.key('live', siteId),
    queryFn: () => m.get<LiveResponse>(`/api/m/live${qs({ siteId: siteId || undefined })}`),
    refetchInterval: visible ? 20_000 : false,
  });

  const rows = useMemo(() => (live.data?.rows ?? []).filter((r) => matches(r, filter)), [live.data, filter]);
  const selected = live.data?.rows.find((r) => r.key === selectedKey) ?? null;
  const select = useCallback((row: LiveRow) => setSelectedKey(row.key), []);
  const sites = siteId ? m.sites.filter((s) => s.id === siteId) : m.sites.filter((s) => s.active);

  if (live.isPending) return <PageLoader />;
  if (live.isError) return <ErrorBox error={live.error} onRetry={() => void live.refetch()} />;
  const data = live.data;
  const c = data.counts;
  const attention = c.review + c.missingCheckout;
  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? 'all' : f));

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">{t('common.today')}</h1>
          <p className="mt-0.5 text-sm text-muted">{fmtFullDate(data.now, data.timezone)}</p>
        </div>
        <div className="flex items-center gap-2">
          {m.sites.length > 1 && (
            <Select value={siteId} onChange={(e) => setSiteId(Number(e.target.value))} className="w-auto min-w-40" aria-label={t('manager.live.site')}>
              <option value={0}>{t('manager.live.allSites')}</option>
              {m.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <span className="hidden text-xs text-faint sm:inline">
            {t('manager.live.updated', { time: fmtRelative(new Date(live.dataUpdatedAt).toISOString(), now) })}
          </span>
          <IconButton icon={RefreshCw} label={t('manager.live.refresh')} variant="secondary" onClick={() => void live.refetch()} className={live.isFetching ? '[&_svg]:animate-spin' : ''} />
        </div>
      </div>

      <div className="-mx-4 mb-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {[
          { f: 'on_site' as Filter, label: t('manager.live.groups.onSite'), value: c.onSite, tone: 'green' as const, hint: t('manager.live.stats.onSiteHint', { total: c.total }) },
          {
            f: 'missing' as Filter,
            label: t('manager.live.groups.notArrived'),
            value: c.late + c.absent,
            tone: 'red' as const,
            hint: c.absent ? t('manager.live.stats.absentHint', { count: c.absent }) : t('manager.live.stats.startedHint'),
          },
          { f: 'late_arrivals' as Filter, label: t('manager.live.stats.cameLate'), value: c.lateArrivals, tone: 'amber' as const, hint: t('manager.live.stats.cameLateHint') },
          { f: 'upcoming' as Filter, label: t('manager.live.groups.comingLater'), value: c.upcoming, tone: 'blue' as const, hint: t('manager.live.stats.comingLaterHint') },
          { f: 'checked_out' as Filter, label: t('manager.live.groups.checkedOut'), value: c.checkedOut, tone: 'gray' as const, hint: t('manager.live.stats.checkedOutHint') },
        ].map((s) => (
          <div key={s.f} className="w-40 shrink-0 snap-start sm:w-auto">
            <Stat label={s.label} value={s.value} tone={s.tone} hint={s.hint} active={filter === s.f} onClick={() => toggle(s.f)} />
          </div>
        ))}
      </div>

      {attention > 0 && (
        <ButtonLink to={`${m.base}/requests`} variant="secondary" block className="mb-4 h-auto justify-between rounded-2xl px-4 py-3 text-start">
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Inbox className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-ink">{t('manager.live.attention', { count: attention })}</span>
              <span className="block text-[13px] font-normal text-muted">{t('manager.live.attentionHint')}</span>
            </span>
          </span>
          <ChevronRight className="size-5 text-faint" />
        </ButtonLink>
      )}

      {!isDesktop && (
        <Segmented
          className="mb-4 w-full"
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: t('manager.live.list'), icon: List },
            { value: 'map', label: t('manager.live.map'), icon: MapIcon },
          ]}
        />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(420px,1fr)_minmax(0,1fr)]">
        {(isDesktop || view === 'list') && (
          <div className="min-w-0">
            {filter !== 'all' && (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="text-ink-2">{tRich('manager.live.showing', { shown: <b>{rows.length}</b>, total: data.rows.length })}</span>
                <button className="font-medium text-brand" onClick={() => setFilter('all')}>
                  {t('manager.live.showAll')}
                </button>
              </div>
            )}
            {data.rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Users}
                  title={t('manager.live.emptyTitle')}
                  body={t('manager.live.emptyBody')}
                  action={
                    <ButtonLink to={`${m.base}/schedule`} variant="brand">
                      {t('manager.live.planShifts')}
                    </ButtonLink>
                  }
                />
              </Card>
            ) : (
              <div className="space-y-5">
                {groups().map((g) => {
                  const list = rows.filter((r) => g.statuses.includes(r.status));
                  if (list.length === 0) return null;
                  return (
                    <section key={g.title}>
                      <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-muted">
                        <span className={cx('size-2 rounded-full', toneDot[STATUS_TONE[g.statuses[0]!]])} />
                        {g.title} <span className="font-normal text-faint">{list.length}</span>
                      </h2>
                      <Card className="divide-y divide-line overflow-hidden">
                        {list.map((r) => (
                          <LiveRowItem key={r.key} row={r} tz={data.timezone} selected={r.key === selectedKey} onClick={() => select(r)} />
                        ))}
                      </Card>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {(isDesktop || view === 'map') && (
          <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <LiveMap sites={sites} rows={data.rows} onSelect={select} className="h-[60dvh] min-h-[360px] lg:h-[calc(100dvh-170px)]" />
            <p className="mt-2 px-1 text-xs text-faint">{t('manager.live.mapHint')}</p>
          </div>
        )}
      </div>

      <PersonSheet row={selected} tz={data.timezone} sites={m.sites} onClose={() => setSelectedKey(null)} onChanged={() => void live.refetch()} />
    </div>
  );
}

function LiveRowItem({ row, tz, selected, onClick }: { row: LiveRow; tz: string; selected: boolean; onClick: () => void }) {
  const badge = statusBadge(row, tz);
  const ringTone = STATUS_TONE[row.status];
  return (
    <div className={cx('flex items-center gap-3 px-3 py-3 transition-colors sm:px-4', selected ? 'bg-brand-soft/60' : 'hover:bg-surface-2/70')}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <Avatar name={row.worker.name} size={42} ring={ringTone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-ink">{row.worker.name}</p>
            {row.needsReview && <Badge tone="violet">{t('manager.live.needsCheck')}</Badge>}
            {row.flags.length > 0 && !row.needsReview && <Badge tone="amber">!</Badge>}
          </div>
          <p className="truncate text-[13px] text-muted">{shiftLine(row, tz)}</p>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 text-end sm:flex">
          <Badge tone={badge.tone}>{badge.text}</Badge>
          <span className="tabular text-xs text-muted">{statusDetail(row, tz)}</span>
        </div>
        <div className="shrink-0 sm:hidden">
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </div>
      </button>
      {row.worker.phone ? (
        <a
          href={telHref(row.worker.phone)}
          className={cx(
            'grid size-10 shrink-0 place-items-center rounded-full transition-colors',
            row.status === 'late' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-surface-2 text-ink-2 hover:bg-surface-3',
          )}
          aria-label={t('manager.shared.callName', { name: row.worker.name })}
          title={t('manager.shared.callPhone', { phone: row.worker.phone })}
        >
          <Phone className="size-[18px]" />
        </a>
      ) : (
        <span className="size-10 shrink-0" />
      )}
    </div>
  );
}
