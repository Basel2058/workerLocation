import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Shift, TeamMember } from '../../../../shared/types';
import { Dialog, useConfirm } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Card, cx, EmptyState, ErrorBox, Field, IconButton, Input, Ltr, PageHeader, PageLoader, Select, Textarea } from '../../components/ui';
import { ApiError, errorMessage, qs } from '../../lib/api';
import { addDays, fmtDayMonth, fmtTime, fmtTimeCompact, fmtWeekday, todayIn, toClockInput, weekStartOf } from '../../lib/format';
import { useIsDesktop } from '../../lib/hooks';
import { t, tRich } from '../../lib/i18n';
import { useManager } from './context';

const SITE_COLORS = ['bg-teal-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-orange-500'];

type Draft =
  | { mode: 'create'; workerIds: number[]; dates: string[]; siteId: number; start: string; end: string; note: string }
  | { mode: 'edit'; shift: Shift; siteId: number; date: string; start: string; end: string; note: string };

export function SchedulePage() {
  const m = useManager();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const isDesktop = useIsDesktop();
  const today = todayIn(m.tz);
  const [week, setWeek] = useState(() => weekStartOf(today));
  const [day, setDay] = useState(today);
  const [draft, setDraft] = useState<Draft | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  const shifts = useQuery({
    queryKey: m.key('shifts', week),
    queryFn: () => m.get<Shift[]>(`/api/m/shifts${qs({ from: week, to: addDays(week, 6) })}`),
  });
  const team = useQuery({ queryKey: m.key('team'), queryFn: () => m.get<TeamMember[]>('/api/m/team') });
  const workers = (team.data ?? []).filter((w) => w.active);
  const siteColor = (siteId: number) => SITE_COLORS[Math.max(0, m.sites.findIndex((s) => s.id === siteId)) % SITE_COLORS.length]!;
  const defaultSite = m.sites.find((s) => s.active)?.id ?? 0;

  const openCreate = (workerIds: number[], dates: string[]) =>
    setDraft({ mode: 'create', workerIds, dates, siteId: defaultSite, start: '08:00', end: '16:00', note: '' });
  const openEdit = (s: Shift) =>
    setDraft({ mode: 'edit', shift: s, siteId: s.siteId, date: s.date, start: toClockInput(s.startsAt, m.tz), end: toClockInput(s.endsAt, m.tz), note: s.note });

  const copyLastWeek = async () => {
    const from = addDays(week, -7);
    const ok = await confirm({
      title: t('manager.schedule.copyTitle'),
      body: t('manager.schedule.copyBody', { date: fmtDayMonth(from) }),
      confirmText: t('manager.schedule.copyConfirm'),
    });
    if (!ok) return;
    try {
      const res = await m.post<{ created: number; skipped: number }>('/api/m/shifts/copy-week', { from, to: week });
      const copied = t('manager.schedule.copied', { count: res.created });
      toast.success(res.skipped ? `${copied}${t('common.separator')}${t('manager.schedule.skipped', { count: res.skipped })}` : copied);
      await qc.invalidateQueries({ queryKey: m.key('shifts') });
    } catch (err) {
      toast.error(err);
    }
  };

  const byCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts.data ?? []) {
      const k = `${s.workerId}|${s.date}`;
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [shifts.data]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t('manager.schedule.title')}
        description={t('manager.schedule.description')}
        actions={
          <>
            <Button icon={Copy} onClick={() => void copyLastWeek()}>
              {t('manager.schedule.copyLastWeek')}
            </Button>
            <Button variant="brand" icon={Plus} onClick={() => openCreate([], [isDesktop ? days[0]! : day])} disabled={!m.sites.length}>
              {t('manager.schedule.addShifts')}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label={t('manager.schedule.previousWeek')} variant="secondary" onClick={() => setWeek(addDays(week, -7))} />
          <IconButton icon={ChevronRight} label={t('manager.schedule.nextWeek')} variant="secondary" onClick={() => setWeek(addDays(week, 7))} />
          <p className="ms-2 text-[15px] font-semibold">{t('common.range', { from: fmtDayMonth(days[0]!), to: fmtDayMonth(days[6]!) })}</p>
        </div>
        {week !== weekStartOf(today) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWeek(weekStartOf(today));
              setDay(today);
            }}
          >
            {t('manager.schedule.thisWeek')}
          </Button>
        )}
      </div>

      {!m.sites.length && (
        <Card className="mb-4">
          <EmptyState icon={CalendarDays} title={t('manager.schedule.noSitesTitle')} body={t('manager.schedule.noSitesBody')} />
        </Card>
      )}

      {shifts.isError ? (
        <ErrorBox error={shifts.error} onRetry={() => void shifts.refetch()} />
      ) : shifts.isPending || team.isPending ? (
        <PageLoader />
      ) : isDesktop ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky start-0 z-10 w-52 bg-surface px-4 py-3 text-start font-medium text-muted">{t('manager.shared.worker')}</th>
                {days.map((d) => (
                  <th key={d} className={cx('px-2 py-3 text-start font-medium', d === today ? 'text-brand' : 'text-muted')}>
                    <span className="block text-xs">{fmtWeekday(d)}</span>
                    <span className={cx('text-[15px]', d === today ? 'font-semibold' : 'text-ink')}>{fmtDayMonth(d)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="group border-b border-line last:border-0">
                  <td className="sticky start-0 z-10 bg-surface px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={w.fullName} size={30} />
                      <span className="truncate font-medium">{w.fullName}</span>
                    </div>
                  </td>
                  {days.map((d) => {
                    const list = byCell.get(`${w.id}|${d}`) ?? [];
                    return (
                      <td key={d} className={cx('h-16 px-1.5 py-1.5 align-top', d === today && 'bg-brand-soft/30')}>
                        <div className="flex h-full flex-col gap-1">
                          {list.map((s) => (
                            <ShiftChip key={s.id} shift={s} tz={m.tz} color={siteColor(s.siteId)} onClick={() => openEdit(s)} />
                          ))}
                          {list.length === 0 && (
                            <button
                              onClick={() => openCreate([w.id], [d])}
                              className="grid h-full min-h-12 place-items-center rounded-lg text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-ink focus:opacity-100"
                              aria-label={t('manager.schedule.addShiftFor', { name: w.fullName, day: fmtWeekday(d, 'long') })}
                            >
                              <Plus className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {workers.length === 0 && <EmptyState title={t('manager.schedule.noWorkersTitle')} body={t('manager.schedule.noWorkersBody')} />}
        </Card>
      ) : (
        <MobileDays days={days} day={day} setDay={setDay} today={today} shifts={shifts.data ?? []} tz={m.tz} siteColor={siteColor} onEdit={openEdit} onAdd={() => openCreate([], [day])} />
      )}

      {m.sites.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-3 px-1 text-xs text-muted">
          {m.sites.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className={cx('size-2.5 rounded-full', siteColor(s.id))} /> {s.name}
            </span>
          ))}
        </div>
      )}

      <ShiftDialog draft={draft} setDraft={setDraft} workers={workers} weekDays={days} tz={m.tz} />
    </div>
  );
}

function ShiftChip({ shift, tz, color, onClick }: { shift: Shift; tz: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-lg bg-surface-2 px-2 py-1.5 text-start ring-1 ring-line transition-colors hover:bg-surface-3" title={shift.note || undefined}>
      <span className="flex items-center gap-1.5">
        <span className={cx('size-2 shrink-0 rounded-full', color)} />
        <span className="tabular truncate text-[13px] font-medium">
          {t('common.range', { from: fmtTimeCompact(shift.startsAt, tz), to: fmtTimeCompact(shift.endsAt, tz) })}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-muted">{shift.siteName}</span>
    </button>
  );
}

function MobileDays({
  days,
  day,
  setDay,
  today,
  shifts,
  tz,
  siteColor,
  onEdit,
  onAdd,
}: {
  days: string[];
  day: string;
  setDay: (d: string) => void;
  today: string;
  shifts: Shift[];
  tz: string;
  siteColor: (id: number) => string;
  onEdit: (s: Shift) => void;
  onAdd: () => void;
}) {
  const selected = days.includes(day) ? day : days[0]!;
  const list = shifts.filter((s) => s.date === selected);
  return (
    <div>
      <div className="mb-4 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const count = shifts.filter((s) => s.date === d).length;
          return (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={cx(
                'flex flex-col items-center rounded-xl py-2 text-xs transition-colors',
                d === selected ? 'bg-ink text-bg' : d === today ? 'bg-brand-soft text-brand' : 'bg-surface text-ink-2 ring-1 ring-line',
              )}
            >
              <span className="opacity-80">{fmtWeekday(d)}</span>
              <span className="text-[15px] font-semibold">{d.slice(8)}</span>
              <span className={cx('mt-0.5 size-1.5 rounded-full', count ? (d === selected ? 'bg-bg' : 'bg-brand') : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
      <Card className="divide-y divide-line">
        {list.length === 0 ? (
          <EmptyState
            title={t('manager.schedule.noShiftsDay')}
            action={
              <Button icon={Plus} onClick={onAdd}>
                {t('manager.schedule.addShifts')}
              </Button>
            }
          />
        ) : (
          list.map((s) => (
            <button key={s.id} onClick={() => onEdit(s)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2/60">
              <Avatar name={s.workerName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.workerName}</p>
                <p className="flex items-center gap-1.5 truncate text-[13px] text-muted">
                  <span className={cx('size-2 shrink-0 rounded-full', siteColor(s.siteId))} />
                  {s.siteName}
                  {s.note && `${t('common.separator')}${s.note}`}
                </p>
              </div>
              <span className="tabular text-sm font-medium">{t('common.range', { from: fmtTime(s.startsAt, tz), to: fmtTime(s.endsAt, tz) })}</span>
            </button>
          ))
        )}
      </Card>
    </div>
  );
}

function ShiftDialog({
  draft,
  setDraft,
  workers,
  weekDays,
  tz,
}: {
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  workers: TeamMember[];
  weekDays: string[];
  tz: string;
}) {
  const m = useManager();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clashes, setClashes] = useState<string[]>([]);

  const close = () => {
    setDraft(null);
    setError(null);
    setClashes([]);
    setSearch('');
  };
  const done = async (msg: string) => {
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: m.key() });
    close();
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setClashes([]);
    try {
      if (draft.mode === 'create') {
        const res = await m.post<Shift[]>('/api/m/shifts', {
          workerIds: draft.workerIds,
          siteId: draft.siteId,
          dates: draft.dates,
          start: draft.start,
          end: draft.end,
          note: draft.note,
        });
        await done(t('manager.schedule.added', { count: res.length }));
      } else {
        await m.patch(`/api/m/shifts/${draft.shift.id}`, { siteId: draft.siteId, date: draft.date, start: draft.start, end: draft.end, note: draft.note });
        await done(t('manager.schedule.updated'));
      }
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && Array.isArray((err.details as { clashes?: string[] })?.clashes)) {
        setClashes((err.details as { clashes: string[] }).clashes);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (draft?.mode !== 'edit') return;
    const ok = await confirm({
      title: t('manager.schedule.deleteTitle'),
      body: t('manager.schedule.deleteBody', { name: draft.shift.workerName, day: fmtWeekday(draft.shift.date, 'long') }),
      confirmText: t('common.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await m.del(`/api/m/shifts/${draft.shift.id}`);
      await done(t('manager.schedule.deleted'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!draft) return <Dialog open={false} onClose={close} />;
  const filtered = workers.filter((w) => w.fullName.toLowerCase().includes(search.toLowerCase()));
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch } as Draft);
  const overnight = draft.end <= draft.start;
  const valid =
    !!draft.siteId && !!draft.start && !!draft.end && (draft.mode === 'edit' || (draft.workerIds.length > 0 && draft.dates.length > 0));

  return (
    <Dialog
      open
      onClose={close}
      size="lg"
      title={draft.mode === 'create' ? t('manager.schedule.addShifts') : t('manager.schedule.editShift')}
      description={draft.mode === 'edit' ? draft.shift.workerName : t('manager.schedule.createHint')}
      footer={
        <>
          {draft.mode === 'edit' && (
            <Button variant="dangerSoft" icon={Trash2} className="me-auto" onClick={() => void remove()}>
              {t('common.delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="brand" loading={busy} disabled={!valid} onClick={() => void save()}>
            {draft.mode === 'create'
              ? t('manager.schedule.addCount', { count: Math.max(1, draft.workerIds.length * draft.dates.length) })
              : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {draft.mode === 'create' && (
          <Field label={t('manager.schedule.who', { count: draft.workerIds.length })}>
            <div className="rounded-xl ring-1 ring-line">
              <div className="relative border-b border-line">
                <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('common.search')}
                  className="h-10 w-full rounded-t-xl bg-transparent pe-3 ps-9 text-sm outline-none"
                />
              </div>
              <div className="max-h-52 overflow-y-auto p-1">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-brand)]"
                    checked={filtered.length > 0 && filtered.every((w) => draft.workerIds.includes(w.id))}
                    onChange={(e) =>
                      update({
                        workerIds: e.target.checked
                          ? [...new Set([...draft.workerIds, ...filtered.map((w) => w.id)])]
                          : draft.workerIds.filter((id) => !filtered.some((w) => w.id === id)),
                      })
                    }
                  />
                  {search ? t('manager.schedule.everyoneShown') : t('manager.schedule.everyone')}
                </label>
                {filtered.map((w) => (
                  <label key={w.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-brand)]"
                      checked={draft.workerIds.includes(w.id)}
                      onChange={(e) =>
                        update({ workerIds: e.target.checked ? [...draft.workerIds, w.id] : draft.workerIds.filter((id) => id !== w.id) })
                      }
                    />
                    <Avatar name={w.fullName} size={26} />
                    {w.fullName}
                  </label>
                ))}
              </div>
            </div>
          </Field>
        )}

        {draft.mode === 'create' ? (
          <Field label={t('manager.schedule.days')}>
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((d) => {
                const on = draft.dates.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update({ dates: on ? draft.dates.filter((x) => x !== d) : [...draft.dates, d].sort() })}
                    className={cx(
                      'flex flex-col items-center rounded-xl py-2 text-xs ring-1 transition-colors',
                      on ? 'bg-brand text-on-brand ring-brand' : 'bg-surface text-ink-2 ring-line hover:bg-surface-2',
                    )}
                  >
                    <span>{fmtWeekday(d)}</span>
                    <span className="text-sm font-semibold">{d.slice(8)}</span>
                  </button>
                );
              })}
            </div>
            {/* Named after the days they pick ("Mon – Fri"), so they stay right in every language and with any first weekday. */}
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="xs" variant="soft" onClick={() => update({ dates: weekDays.slice(0, 5) })}>
                {t('common.range', { from: fmtWeekday(weekDays[0]!), to: fmtWeekday(weekDays[4]!) })}
              </Button>
              <Button size="xs" variant="soft" onClick={() => update({ dates: weekDays.slice(0, 6) })}>
                {t('common.range', { from: fmtWeekday(weekDays[0]!), to: fmtWeekday(weekDays[5]!) })}
              </Button>
              <Button size="xs" variant="soft" onClick={() => update({ dates: weekDays })}>
                {t('manager.schedule.allWeek')}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => update({ dates: [] })}>
                {t('manager.schedule.clear')}
              </Button>
            </div>
          </Field>
        ) : (
          <Field label={t('manager.schedule.day')}>
            <Input type="date" value={draft.date} onChange={(e) => update({ date: e.target.value })} />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('manager.shared.workplace')} className="sm:col-span-1">
            <Select value={draft.siteId} onChange={(e) => update({ siteId: Number(e.target.value) })}>
              {m.sites
                .filter((s) => s.active || s.id === draft.siteId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={t('manager.schedule.starts')}>
            <Input type="time" value={draft.start} onChange={(e) => update({ start: e.target.value })} />
          </Field>
          <Field label={t('manager.schedule.ends')} hint={overnight ? t('manager.schedule.nextDay') : undefined}>
            <Input type="time" value={draft.end} onChange={(e) => update({ end: e.target.value })} />
          </Field>
        </div>
        <Field label={t('manager.schedule.note')} optional>
          <Textarea
            rows={2}
            maxLength={300}
            value={draft.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder={t('manager.schedule.notePlaceholder')}
          />
        </Field>
        {error && (
          <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            <p>{error}</p>
            {clashes.length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {clashes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-faint">{tRich('manager.schedule.timeZone', { tz: <Ltr>{tz}</Ltr> })}</p>
      </div>
    </Dialog>
  );
}
