import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock3, Inbox, MapPinned, Users } from 'lucide-react';
import { Route, Routes } from 'react-router';
import type { ManagerOverview } from '../../../../shared/types';
import { AppShell } from '../../components/AppShell';
import { ButtonLink, ErrorBox, PageLoader } from '../../components/ui';
import { get } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { t, tRich } from '../../lib/i18n';
import { AccountPage } from '../Account';
import { ManagerProvider, useManagerValue } from './context';
import { HoursPage } from './Hours';
import { LivePage } from './Live';
import { RequestsPage } from './Requests';
import { SchedulePage } from './Schedule';
import { TeamPage, WorkerDetailPage } from './Team';

export default function ManagerApp({ base, companyId }: { base: string; companyId?: number }) {
  const user = useUser();
  const overview = useQuery({
    queryKey: ['m', companyId ?? 0, 'overview'],
    queryFn: () => get<ManagerOverview>('/api/m/overview', { companyId }),
    refetchInterval: 30_000,
  });
  const value = useManagerValue(
    base,
    companyId ?? null,
    overview.data?.company,
    overview.data?.sites ?? [],
    overview.data?.pendingReviews ?? 0,
    user.timezone,
  );

  if (overview.isPending) return <PageLoader />;
  if (overview.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorBox error={overview.error} onRetry={() => void overview.refetch()} />
      </div>
    );
  }

  const company = overview.data.company;
  const items = [
    { to: base, label: t('manager.nav.live'), icon: MapPinned, end: true },
    { to: `${base}/requests`, label: t('manager.nav.requests'), icon: Inbox, badge: overview.data.pendingReviews },
    { to: `${base}/schedule`, label: t('manager.nav.schedule'), icon: CalendarDays },
    { to: `${base}/hours`, label: t('manager.nav.hours'), icon: Clock3 },
    { to: `${base}/team`, label: t('manager.nav.team'), icon: Users },
  ];

  const banner = companyId ? (
    <div className="flex items-center justify-between gap-3 border-b border-violet-500/20 bg-violet-500/10 px-4 py-2 text-[13px] text-violet-800 sm:px-6 lg:px-8 dark:text-violet-200">
      <span className="truncate">{tRich('manager.shell.ownerBanner', { company: <b>{company.name}</b> })}</span>
      <ButtonLink to={`/dev/companies/${companyId}`} size="xs" variant="secondary" icon={ArrowLeft}>
        {t('manager.shell.backToConsole')}
      </ButtonLink>
    </div>
  ) : null;

  return (
    <ManagerProvider value={value}>
      <AppShell title={company.name} subtitle={companyId ? t('manager.shell.ownerSubtitle') : t('common.roles.manager')} items={items} accountTo={`${base}/account`} banner={banner}>
        <Routes>
          <Route index element={<LivePage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="hours" element={<HoursPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="team/:workerId" element={<WorkerDetailPage />} />
          <Route path="account" element={<AccountPage />} />
        </Routes>
      </AppShell>
    </ManagerProvider>
  );
}
