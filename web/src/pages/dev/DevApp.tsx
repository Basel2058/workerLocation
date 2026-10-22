import { useQuery } from '@tanstack/react-query';
import { Activity, Building2, KeyRound, MapPinned, ScrollText, ShieldAlert, TriangleAlert, Users } from 'lucide-react';
import { Route, Routes } from 'react-router';
import type { DevOverview } from '../../../../shared/types';
import { AppShell } from '../../components/AppShell';
import { get } from '../../lib/api';
import { AccountPage } from '../Account';
import { CompaniesPage, CompanyDetailPage } from './Companies';
import { AlertsPage, AuditPage, LogsPage, PunchLogPage, SessionsPage } from './Logs';
import { OverviewPage } from './Overview';
import { PeoplePage, PersonDetailPage } from './People';

export default function DevApp() {
  const overview = useQuery({ queryKey: ['dev', 'overview'], queryFn: () => get<DevOverview>('/api/dev/overview'), refetchInterval: 30_000 });
  const errors = overview.data?.recentErrors.length ?? 0;
  const items = [
    { to: '/dev', label: 'Overview', icon: Activity, end: true },
    { to: '/dev/companies', label: 'Companies', icon: Building2 },
    { to: '/dev/people', label: 'People', icon: Users },
    { to: '/dev/punches', label: 'Check-ins', icon: MapPinned },
    { to: '/dev/alerts', label: 'Alerts', icon: ShieldAlert },
    { to: '/dev/audit', label: 'Change history', icon: ScrollText },
    { to: '/dev/logs', label: 'System log', icon: TriangleAlert, badge: errors },
    { to: '/dev/sessions', label: 'Sessions', icon: KeyRound },
  ];
  return (
    <AppShell title="Owner console" subtitle={overview.data?.status === 'degraded' ? 'Needs attention' : 'All systems normal'} items={items} accountTo="/dev/account">
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
