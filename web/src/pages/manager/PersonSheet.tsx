import { useMutation } from '@tanstack/react-query';
import { MessageCircle, MessageSquareText, Pencil, Phone, Radar, TriangleAlert, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { LiveRow, PresenceCheck, Site } from '../../../../shared/types';
import { Dialog } from '../../components/Dialog';
import { MiniMap } from '../../components/maps';
import { useToast } from '../../components/Toast';
import { Avatar, Badge, ButtonAnchor, ButtonLink, Button, Kv, Ltr, Notice } from '../../components/ui';
import { fmtDistance, fmtTime, smsHref, telHref, whatsappHref } from '../../lib/format';
import { flagInfo } from '../../lib/flags';
import { t, tRich } from '../../lib/i18n';
import { useManager } from './context';
import { EntryEditor, type EntryEditorTarget } from './EntryEditor';
import { shiftLine, statusBadge, statusDetail } from './status';

export function presenceText(p: PresenceCheck, tz: string): { text: string; tone: 'green' | 'red' | 'amber' | 'gray' } {
  switch (p.status) {
    case 'pending':
      return { text: t('manager.person.presence.pending', { time: fmtTime(p.requestedAt, tz) }), tone: 'amber' };
    case 'passed':
      return { text: t('manager.person.presence.passed', { time: fmtTime(p.respondedAt, tz) }), tone: 'green' };
    case 'failed':
      return {
        text:
          p.distanceM !== null
            ? t('manager.person.presence.failedAway', { time: fmtTime(p.respondedAt, tz), distance: fmtDistance(p.distanceM) })
            : t('manager.person.presence.failed', { time: fmtTime(p.respondedAt, tz) }),
        tone: 'red',
      };
    case 'expired':
      return { text: t('manager.person.presence.expired', { time: fmtTime(p.requestedAt, tz) }), tone: 'red' };
    default:
      return { text: t('manager.person.presence.cancelled'), tone: 'gray' };
  }
}

/** Details of one person on today's board, with one-tap calling. */
export function PersonSheet({
  row,
  tz,
  sites,
  onClose,
  onChanged,
}: {
  row: LiveRow | null;
  tz: string;
  sites: Site[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const m = useManager();
  const toast = useToast();
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const askPresence = useMutation({
    mutationFn: (workerId: number) => m.post('/api/m/presence', { workerId }),
    onSuccess: () => {
      toast.success(t('manager.person.presenceAsked'));
      onChanged();
    },
    onError: (err) => toast.error(err),
  });

  const site = row?.shift ? sites.find((s) => s.id === row.shift!.siteId) : sites.find((s) => s.name === row?.entry?.siteName);
  const badge = row ? statusBadge(row, tz) : null;

  return (
    <>
      <Dialog open={!!row && !editor} onClose={onClose} size="md">
        {row && badge && (
          <div className="pt-4">
            <div className="flex items-center gap-4">
              <Avatar name={row.worker.name} size={56} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold tracking-tight">{row.worker.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={badge.tone} dot>
                    {badge.text}
                  </Badge>
                  {row.needsReview && <Badge tone="violet">{t('manager.person.needsCheck')}</Badge>}
                </div>
              </div>
            </div>

            {row.worker.phone ? (
              <div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-2">
                <ButtonAnchor href={telHref(row.worker.phone)} variant="success" size="lg" icon={Phone}>
                  {tRich('manager.shared.callPhone', { phone: <Ltr>{row.worker.phone}</Ltr> })}
                </ButtonAnchor>
                <ButtonAnchor href={whatsappHref(row.worker.phone)} target="_blank" rel="noreferrer" variant="secondary" size="lg" icon={MessageCircle} aria-label="WhatsApp" className="px-3.5" />
                <ButtonAnchor href={smsHref(row.worker.phone)} variant="secondary" size="lg" icon={MessageSquareText} aria-label={t('manager.person.textMessage')} className="px-3.5" />
              </div>
            ) : (
              <Notice tone="gray" className="mt-5">
                {t('manager.person.noPhone')}
              </Notice>
            )}

            <div className="mt-5 divide-y divide-line rounded-2xl bg-surface-2/60 px-4">
              <Kv label={t('manager.person.shift')}>{shiftLine(row, tz)}</Kv>
              <Kv label={t('manager.person.status')}>{statusDetail(row, tz)}</Kv>
              {row.entry && (
                <Kv label={t('manager.shared.checkedIn')}>
                  {[fmtTime(row.entry.clockInAt, tz), row.entry.siteName].filter(Boolean).join(t('common.separator'))}
                </Kv>
              )}
              {row.entry?.clockOutAt && <Kv label={t('manager.shared.checkedOut')}>{fmtTime(row.entry.clockOutAt, tz)}</Kv>}
              {row.location && (
                <Kv label={t('manager.person.location')}>
                  {t(
                    row.location.kind === 'check'
                      ? 'manager.person.locationCheck'
                      : row.location.kind === 'out'
                        ? 'manager.person.locationOut'
                        : 'manager.person.locationIn',
                    { time: fmtTime(row.location.at, tz) },
                  )}
                  {row.location.accuracy
                    ? `${t('common.separator')}${t('manager.person.accuracy', { distance: fmtDistance(row.location.accuracy) })}`
                    : ''}
                </Kv>
              )}
            </div>

            {row.presence && (
              <Notice tone={presenceText(row.presence, tz).tone} icon={Radar} className="mt-4">
                {presenceText(row.presence, tz).text}
              </Notice>
            )}

            {row.flags.length > 0 && (
              <div className="mt-4 space-y-2">
                {row.flags.map((f) => (
                  <Notice key={f} tone={flagInfo(f).severity === 'high' ? 'red' : 'amber'} icon={TriangleAlert} title={flagInfo(f).label}>
                    {flagInfo(f).description}
                  </Notice>
                ))}
              </div>
            )}

            {(row.location || row.selfieId) && (
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                {row.location ? (
                  <MiniMap
                    point={row.location}
                    site={site ? { lat: site.lat, lng: site.lng, radiusM: site.radiusM, name: site.name } : null}
                    className="h-40"
                  />
                ) : (
                  <div />
                )}
                {row.selfieId && (
                  <button onClick={() => setPhotoOpen(true)} className="overflow-hidden rounded-xl ring-1 ring-line" aria-label={t('manager.person.showPhoto')}>
                    <img src={`/api/selfies/${row.selfieId}`} alt={t('manager.shared.photoOf', { name: row.worker.name })} className="h-40 w-32 object-cover" loading="lazy" />
                  </button>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {row.status === 'on_site' && row.presence?.status !== 'pending' && (
                <Button icon={Radar} loading={askPresence.isPending} onClick={() => askPresence.mutate(row.worker.id)}>
                  {t('manager.shared.askPresence')}
                </Button>
              )}
              <Button
                icon={Pencil}
                onClick={() =>
                  setEditor(
                    row.entry
                      ? { mode: 'edit', entryId: row.entry.id, workerName: row.worker.name }
                      : {
                          mode: 'create',
                          workerId: row.worker.id,
                          workerName: row.worker.name,
                          siteId: row.shift?.siteId,
                        },
                  )
                }
              >
                {row.entry ? t('manager.person.fixAttendance') : t('manager.shared.addAttendance')}
              </Button>
              <ButtonLink to={`${m.base}/team/${row.worker.id}`} variant="ghost" icon={UserRound}>
                {t('manager.person.profile')}
              </ButtonLink>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={photoOpen && !!row?.selfieId} onClose={() => setPhotoOpen(false)} title={row?.worker.name} size="sm">
        {row?.selfieId && <img src={`/api/selfies/${row.selfieId}`} alt={t('manager.shared.photoOf', { name: row.worker.name })} className="w-full rounded-xl" />}
      </Dialog>

      <EntryEditor
        target={editor}
        onClose={() => {
          setEditor(null);
          onChanged();
        }}
      />
    </>
  );
}
