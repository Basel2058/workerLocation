import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Clock3, Download, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TeamMember, TimeEntry, TimesheetResponse, TimesheetRow } from '../../../../shared/types';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { Avatar, Badge, Button, Card, cx, EmptyState, ErrorBox, Field, Input, PageHeader, PageLoader, Select, Stat, Switch, Textarea } from '../../components/ui';
import { downloadFile, errorMessage, qs } from '../../lib/api';
import { addDays, fmtDay, fmtDuration, fmtHours, fmtTime, localDateOf, todayIn, weekStartOf } from '../../lib/format';
import { useManager } from './context';
import { EntryEditor, type EntryEditorTarget } from './EntryEditor';

type Preset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';

function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const week = weekStartOf(today);
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case 'this-week':
      return { from: week, to: today };
    case 'last-week':
      return { from: addDays(week, -7), to: addDays(week, -1) };
    case 'this-month':
      return { from: monthStart, to: today };
    case 'last-month': {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    default:
      return { from: week, to: today };
  }
}

export function HoursPage() {
  const m = useManager();
  const toast = useToast();
  const today = todayIn(m.tz);
  const [preset, setPreset] = useState<Preset>('this-week');
  const [custom, setCustom] = useState(() => presetRange('this-week', today));
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const [worker, setWorker] = useState<TimesheetRow['worker'] | null>(null);
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null);
  const [pickWorker, setPickWorker] = useState(false);

  const sheet = useQuery({
    queryKey: m.key('timesheet', range.from, range.to),
    queryFn: () => m.get<TimesheetResponse>(`/api/m/timesheets${qs(range)}`),
  });

  const download = async (kind: 'summary' | 'entries') => {
    try {
      await downloadFile(`/api/m/export/${kind}.csv${qs(range)}`, { companyId: m.companyId });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Hours"
        description="Worked time per person. Click a person to see and fix their check-ins."
        actions={
          <>
            <Button icon={Plus} onClick={() => setPickWorker(true)}>
              Add attendance
            </Button>
            <Button icon={Download} onClick={() => void download('summary')}>
              Summary CSV
            </Button>
            <Button icon={Download} onClick={() => void download('entries')}>
              All check-ins CSV
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="w-auto" aria-label="Period">
          <option value="this-week">This week</option>
          <option value="last-week">Last week</option>
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
          <option value="custom">Choose dates…</option>
        </Select>
        {preset === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-auto" aria-label="From" />
            <span className="text-muted">–</span>
            <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-auto" aria-label="To" />
          </div>
        ) : (
          <p className="pb-2.5 text-sm text-muted">
            {fmtDay(range.from)} – {fmtDay(range.to)}
          </p>
        )}
      </div>

      {sheet.isPending ? (
        <PageLoader />
      ) : sheet.isError ? (
        <ErrorBox error={sheet.error} onRetry={() => void sheet.refetch()} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Worked" value={`${fmtHours(sheet.data.totals.workedMinutes)} h`} icon={Clock3} />
            <Stat label="Planned" value={`${fmtHours(sheet.data.totals.scheduledMinutes)} h`} />
            <Stat label="Late arrivals" value={sheet.data.totals.lateCount} tone="amber" />
            <Stat label="Absences" value={sheet.data.totals.absentCount} tone="red" />
          </div>

          <Card className="overflow-hidden">
            {sheet.data.rows.length === 0 ? (
              <EmptyState icon={Clock3} title="No workers" />
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_24px] gap-3 border-b border-line px-5 py-3 text-xs font-medium text-muted md:grid">
                  <span>Worker</span>
                  <span className="text-end">Worked</span>
                  <span className="text-end">Planned</span>
                  <span className="text-end">Days</span>
                  <span className="text-end">Late</span>
                  <span className="text-end">Absent</span>
                  <span className="text-end">To fix</span>
                  <span />
                </div>
                <div className="divide-y divide-line">
                  {sheet.data.rows.map((r) => (
                    <button
                      key={r.worker.id}
                      onClick={() => setWorker(r.worker)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-start hover:bg-surface-2/60 md:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_24px] md:px-5"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={r.worker.name} size={34} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.worker.name}</span>
                          <span className="block truncate text-xs text-muted md:hidden">
                            {r.daysWorked} days · {r.lateCount} late · {r.absentCount} absent
                          </span>
                        </span>
                      </span>
                      <span className="tabular text-end font-semibold md:font-medium">{fmtDuration(r.workedMinutes)}</span>
                      <span className="tabular hidden text-end text-muted md:block">{fmtDuration(r.scheduledMinutes)}</span>
                      <span className="tabular hidden text-end md:block">{r.daysWorked}</span>
                      <span className={cx('tabular hidden text-end md:block', r.lateCount && 'font-medium text-amber-700 dark:text-amber-300')}>{r.lateCount}</span>
                      <span className={cx('tabular hidden text-end md:block', r.absentCount && 'font-medium text-rose-600 dark:text-rose-400')}>{r.absentCount}</span>
                      <span className="hidden text-end md:block">{r.openIssues ? <Badge tone="amber">{r.openIssues}</Badge> : <span className="text-faint">—</span>}</span>
                      <ChevronRight className="hidden size-4 text-faint md:block" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <WorkerEntries
        worker={worker}
        range={range}
        onClose={() => setWorker(null)}
        onEdit={(e) => setEditor({ mode: 'edit', entryId: e.id, workerName: e.workerName })}
        onAdd={(w) => setEditor({ mode: 'create', workerId: w.id, workerName: w.name })}
      />
      <PickWorker
        open={pickWorker}
        onClose={() => setPickWorker(false)}
        onPick={(w) => {
          setPickWorker(false);
          setEditor({ mode: 'create', workerId: w.id, workerName: w.fullName });
        }}
      />
      <EntryEditor target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}

function WorkerEntries({
  worker,
  range,
  onClose,
  onEdit,
  onAdd,
}: {
  worker: TimesheetRow['worker'] | null;
  range: { from: string; to: string };
  onClose: () => void;
  onEdit: (e: TimeEntry) => void;
  onAdd: (w: TimesheetRow['worker']) => void;
}) {
  const m = useManager();
  const qc = useQueryClient();
  const toast = useToast();
  const [showRemoved, setShowRemoved] = useState(false);
  const [restore, setRestore] = useState<TimeEntry | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({
    queryKey: m.key('entries', worker?.id, range.from, range.to),
    queryFn: () => m.get<TimeEntry[]>(`/api/m/entries${qs({ workerId: worker!.id, ...range, includeVoid: 1 })}`),
    enabled: !!worker,
  });
  const entries = useMemo(() => (q.data ?? []).filter((e) => showRemoved || e.status !== 'void'), [q.data, showRemoved]);
  const removedCount = (q.data ?? []).filter((e) => e.status === 'void').length;

  const doRestore = async () => {
    if (!restore) return;
    try {
      await m.post(`/api/m/entries/${restore.id}/restore`, { reason });
      toast.success('Restored');
      setRestore(null);
      setReason('');
      await qc.invalidateQueries({ queryKey: m.key() });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <Dialog open={!!worker && !restore} onClose={onClose} size="lg" title={worker?.name} description={`${fmtDay(range.from)} – ${fmtDay(range.to)}`}>
        {q.isPending ? (
          <PageLoader />
        ) : q.isError ? (
          <ErrorBox error={q.error} />
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <Button size="sm" icon={Plus} onClick={() => worker && onAdd(worker)}>
                Add attendance
              </Button>
              {removedCount > 0 && <Switch checked={showRemoved} onChange={setShowRemoved} label={`Show removed (${removedCount})`} />}
            </div>
            {entries.length === 0 ? (
              <EmptyState title="No check-ins in this period" />
            ) : (
              <div className="divide-y divide-line rounded-xl ring-1 ring-line">
                {entries.map((e) => (
                  <div key={e.id} className={cx('flex items-center gap-3 px-3 py-3', e.status === 'void' && 'opacity-60')}>
                    <div className="w-24 shrink-0 text-sm">
                      <p className="font-medium">{fmtDay(localDateOf(e.clockInAt, m.tz))}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-sm font-medium">
                        {fmtTime(e.clockInAt, m.tz)} → {e.clockOutAt ? fmtTime(e.clockOutAt, m.tz) : e.status === 'open' ? 'now' : '—'}
                        <span className="ms-2 font-normal text-muted">{e.minutes !== null ? fmtDuration(e.minutes) : ''}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {e.siteName && <span className="me-1 text-xs text-muted">{e.siteName}</span>}
                        {e.status === 'void' && <Badge tone="gray">Removed</Badge>}
                        {e.status === 'open' && <Badge tone="green">At work</Badge>}
                        {e.status === 'incomplete' && <Badge tone="amber">No check-out</Badge>}
                        {e.lateMinutes !== null && <Badge tone="amber">{fmtDuration(e.lateMinutes)} late</Badge>}
                        {e.needsReview && <Badge tone="violet">To confirm</Badge>}
                        {e.source === 'manual' && <Badge tone="blue">Added by hand</Badge>}
                        {e.editedByName && e.source !== 'manual' && <Badge tone="gray">Edited by {e.editedByName}</Badge>}
                      </div>
                    </div>
                    {e.status === 'void' ? (
                      <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setRestore(e)}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(e)}>
                        Fix
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!restore}
        onClose={() => setRestore(null)}
        title="Restore attendance"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestore(null)}>
              Cancel
            </Button>
            <Button variant="brand" disabled={reason.trim().length < 3} onClick={() => void doRestore()}>
              Restore
            </Button>
          </>
        }
      >
        <Field label="Reason">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this attendance correct after all?" />
        </Field>
      </Dialog>
    </>
  );
}

function PickWorker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (w: TeamMember) => void }) {
  const m = useManager();
  const team = useQuery({ queryKey: m.key('team'), queryFn: () => m.get<TeamMember[]>('/api/m/team'), enabled: open });
  const [q, setQ] = useState('');
  const list = (team.data ?? []).filter((w) => w.active && w.fullName.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onClose={onClose} title="Add attendance for…" size="sm">
      <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
        {list.map((w) => (
          <button key={w.id} onClick={() => onPick(w)} className="flex w-full items-center gap-3 px-1 py-2.5 text-start hover:bg-surface-2">
            <Avatar name={w.fullName} size={32} />
            <span className="font-medium">{w.fullName}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
