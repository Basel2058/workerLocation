import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Site, TimeEntry } from '../../../../shared/types';
import { Dialog, useConfirm } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { Button, Field, Input, Select, Switch, Textarea } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { toLocalInput } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useManager } from './context';

export type EntryEditorTarget =
  | { mode: 'edit'; entryId: number; workerName: string }
  | { mode: 'create'; workerId: number; workerName: string; siteId?: number; clockIn?: string };

/** Add or correct a worker's attendance. A reason is always required and recorded in the audit log. */
export function EntryEditor({ target, onClose }: { target: EntryEditorTarget | null; onClose: () => void }) {
  const m = useManager();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const entryId = target?.mode === 'edit' ? target.entryId : null;
  const entry = useQuery({
    queryKey: m.key('entry', entryId),
    queryFn: () => m.get<TimeEntry>(`/api/m/entries/${entryId}`),
    enabled: !!entryId,
  });

  const [siteId, setSiteId] = useState<number>(0);
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [stillHere, setStillHere] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setReason('');
    if (!target) return;
    if (target.mode === 'create') {
      setSiteId(target.siteId ?? m.sites.find((s) => s.active)?.id ?? 0);
      setClockIn(target.clockIn ?? toLocalInput(new Date().toISOString(), m.tz).slice(0, 11) + '08:00');
      setClockOut('');
      setStillHere(false);
    }
  }, [target, m.sites, m.tz]);

  useEffect(() => {
    const e = entry.data;
    if (!e || target?.mode !== 'edit') return;
    setSiteId(e.siteId ?? m.sites[0]?.id ?? 0);
    setClockIn(toLocalInput(e.clockInAt, m.tz));
    setClockOut(e.clockOutAt ? toLocalInput(e.clockOutAt, m.tz) : e.shiftEndsAt && e.status === 'incomplete' ? toLocalInput(e.shiftEndsAt, m.tz) : '');
    setStillHere(e.status === 'open');
  }, [entry.data, target, m.sites, m.tz]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: m.key() });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = stillHere ? null : clockOut || null;
      if (target?.mode === 'create') {
        await m.post('/api/m/entries', { workerId: target.workerId, siteId, clockIn, clockOut: out, reason: reason.trim() });
        toast.success(t('manager.entry.added'));
      } else if (target?.mode === 'edit') {
        await m.patch(`/api/m/entries/${target.entryId}`, { clockIn, clockOut: out, siteId: siteId || undefined, reason: reason.trim() });
        toast.success(t('manager.entry.corrected'));
      }
      await refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (target?.mode !== 'edit') return;
    if (reason.trim().length < 3) {
      setError(t('manager.entry.reasonFirst'));
      return;
    }
    const ok = await confirm({
      title: t('manager.entry.removeTitle'),
      body: t('manager.entry.removeBody'),
      confirmText: t('manager.entry.remove'),
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await m.post(`/api/m/entries/${target.entryId}/void`, { reason: reason.trim() });
      toast.success(t('manager.entry.removed'));
      await refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sites: Site[] = m.sites;
  const canSave = !!siteId && !!clockIn && (stillHere || !!clockOut || target?.mode === 'edit') && reason.trim().length >= 3;

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target?.mode === 'edit' ? t('manager.entry.correctTitle') : t('manager.shared.addAttendance')}
      description={target?.workerName}
      footer={
        <>
          {target?.mode === 'edit' && (
            <Button variant="dangerSoft" icon={Trash2} onClick={() => void remove()} disabled={busy} className="me-auto">
              {t('manager.entry.remove')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="brand" loading={busy} disabled={!canSave} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('manager.shared.workplace')} htmlFor="entry-site">
          <Select id="entry-site" value={siteId} onChange={(e) => setSiteId(Number(e.target.value))}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.active ? s.name : t('manager.entry.siteOff', { name: s.name })}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('manager.shared.checkedIn')} htmlFor="entry-in">
            <Input id="entry-in" type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </Field>
          <Field label={t('manager.shared.checkedOut')} htmlFor="entry-out">
            <Input id="entry-out" type="datetime-local" value={stillHere ? '' : clockOut} disabled={stillHere} onChange={(e) => setClockOut(e.target.value)} />
          </Field>
        </div>
        <Switch checked={stillHere} onChange={setStillHere} label={t('manager.entry.stillHere')} description={t('manager.entry.stillHereHint')} />
        <Field label={t('manager.shared.reason')} htmlFor="entry-reason" hint={t('manager.entry.reasonHint')}>
          <Textarea
            id="entry-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('manager.entry.reasonPlaceholder')}
          />
        </Field>
        {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      </div>
    </Dialog>
  );
}
