import { useQuery } from '@tanstack/react-query';
import { Activity, Building2, KeyRound, MapPinned, ScrollText, ShieldAlert, TriangleAlert, Users } from 'lucide-react';
import { Route, Routes } from 'react-router';
import type { DevOverview } from '../../../../shared/types';
import { AppShell } from '../../components/AppShell';
import { get } from '../../lib/api';
import { t } from '../../lib/i18n';
import { AccountPage } from '../Account';
import { CompaniesPage, CompanyDetailPage } from './Companies';
import { AlertsPage, AuditPage, LogsPage, PunchLogPage, SessionsPage } from './Logs';
import { OverviewPage } from './Overview';
import { PeoplePage, PersonDetailPage } from './People';

export default function DevApp() {
  const overview = useQuery({ queryKey: ['dev', 'overview'], queryFn: () => get<DevOverview>('/api/dev/overview'), refetchInterval: 30_000 });
  const errors = overview.data?.recentErrors.length ?? 0;
  const items = [
    { to: '/dev', label: t('dev.nav.overview'), icon: Activity, end: true },
    { to: '/dev/companies', label: t('dev.nav.companies'), icon: Building2 },
    { to: '/dev/people', label: t('dev.nav.people'), icon: Users },
    { to: '/dev/punches', label: t('dev.nav.punches'), icon: MapPinned },
    { to: '/dev/alerts', label: t('dev.nav.alerts'), icon: ShieldAlert },
    { to: '/dev/audit', label: t('dev.nav.audit'), icon: ScrollText },
    { to: '/dev/logs', label: t('dev.nav.logs'), icon: TriangleAlert, badge: errors },
    { to: '/dev/sessions', label: t('dev.nav.sessions'), icon: KeyRound },
  ];
  return (
    <AppShell
      title={t('dev.shell.title')}
      subtitle={overview.data?.status === 'degraded' ? t('dev.shell.needsAttention') : t('dev.shell.allNormal')}
      items={items}
      accountTo="/dev/account"
    >
      <Routes>
        <Route index element={<OverviewPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="companies/:companyId" element={<CompanyDetailPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/:userId" element={<PersonDetailPage />} />
        <Route path="punches" element={<PunchLogPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="account" element={<AccountPage />} />
      </Routes>
    </AppShell>
  );
}
