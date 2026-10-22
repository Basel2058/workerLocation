import { useQuery } from '@tanstack/react-query';
import { CalendarDays, History, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { WorkerHistoryDay, WorkerShift } from '../../../../shared/types';
import { Badge, Card, EmptyState, ErrorBox, PageLoader, Segmented } from '../../components/ui';
import { get } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { fmtDay, fmtDuration, fmtTime } from '../../lib/format';

export function WorkerShifts() {
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  return (
    <div className="animate-fade-up">
      <header className="flex items-center justify-between pt-2 pb-4">
        <h1 className="text-[26px] font-semibold tracking-tight">My shifts</h1>
      </header>
      <Segmented
        className="mb-4 w-full"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: 'Upcoming', icon: CalendarDays },
          { value: 'history', label: 'Worked', icon: History },
        ]}
      />
      {tab === 'upcoming' ? <Upcoming /> : <WorkedHistory />}
    </div>
  );
}

function Upcoming() {
  const user = useUser();
  const tz = user.timezone;
  const q = useQuery({ queryKey: ['worker-shifts'], queryFn: () => get<WorkerShift[]>('/api/worker/shifts') });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const shifts = q.data.filter((s) => s.state !== 'worked' && s.state !== 'missed');
  if (shifts.length === 0) {
    return <EmptyState icon={CalendarDays} title="No upcoming shifts" body="When your manager plans your shifts, they show up here." />;
  }
  const byDay = new Map<string, WorkerShift[]>();
  for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  return (
    <div className="space-y-4">
      {[...byDay].map(([date, list]) => (
        <section key={date}>
          <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{fmtDay(date, { relative: true, tz })}</h2>
          <Card className="divide-y divide-line">
            {list.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="tabular text-[17px] font-semibold">
                    {fmtTime(s.startsAt, tz)} – {fmtTime(s.endsAt, tz)}
                  </p>
                  <p className="flex items-center gap-1 truncate text-sm text-muted">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {s.siteName}
                  </p>
                  {s.note && <p className="mt-1 text-sm text-ink-2">{s.note}</p>}
                </div>
                <span className="tabular text-sm text-faint">{fmtDuration((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60_000)}</span>
                {s.state === 'now' && <Badge tone="teal">Now</Badge>}
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function WorkedHistory() {
  const user = useUser();
  const tz = user.timezone;
  const q = useQuery({ queryKey: ['worker-history'], queryFn: () => get<WorkerHistoryDay[]>('/api/worker/history?days=30') });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) {
    return <EmptyState icon={History} title="Nothing yet" body="Your check-ins of the last 30 days will show up here." />;
  }
  const total = q.data.reduce((s, d) => s + d.minutes, 0);
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between p-4">
        <span className="text-sm text-muted">Last 30 days</span>
        <span className="tabular text-xl font-semibold">{fmtDuration(total)}</span>
      </Card>
      {q.data.map((day) => (
        <section key={day.date}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold text-muted">{fmtDay(day.date, { relative: true, tz })}</h2>
            <span className="tabular text-[13px] font-medium text-ink-2">
              {day.entries.some((e) => e.status === 'open') ? 'In progress' : fmtDuration(day.minutes)}
            </span>
          </div>
          <Card className="divide-y divide-line">
            {day.entries.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="tabular font-medium">
                    {fmtTime(e.clockInAt, tz)} → {e.clockOutAt ? fmtTime(e.clockOutAt, tz) : e.status === 'open' ? 'now' : '?'}
                  </p>
                  <span className="tabular text-sm text-ink-2">{e.minutes !== null ? fmtDuration(e.minutes) : ''}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {e.siteName && <span className="mr-1 text-sm text-muted">{e.siteName}</span>}
                  {e.status === 'open' && <Badge tone="green" dot>Checked in</Badge>}
                  {e.status === 'incomplete' && <Badge tone="amber">No check-out</Badge>}
                  {e.lateMinutes !== null && <Badge tone="amber">{fmtDuration(e.lateMinutes)} late</Badge>}
                  {e.needsReview && <Badge tone="violet">Waiting for manager</Badge>}
                </div>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
