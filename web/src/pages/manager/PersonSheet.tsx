import { useMutation } from '@tanstack/react-query';
import { MessageCircle, MessageSquareText, Pencil, Phone, Radar, TriangleAlert, UserRound } from 'lucide-react';
import { useState } from 'react';
import { flagInfo, type LiveRow, type PresenceCheck, type Site } from '../../../../shared/types';
import { Dialog } from '../../components/Dialog';
import { MiniMap } from '../../components/maps';
import { useToast } from '../../components/Toast';
import { Avatar, Badge, ButtonAnchor, ButtonLink, Button, Kv, Notice } from '../../components/ui';
import { fmtDistance, fmtTime, smsHref, telHref, whatsappHref } from '../../lib/format';
import { useManager } from './context';
import { EntryEditor, type EntryEditorTarget } from './EntryEditor';
import { shiftLine, statusBadge, statusDetail } from './status';

export function presenceText(p: PresenceCheck, tz: string): { text: string; tone: 'green' | 'red' | 'amber' | 'gray' } {
  switch (p.status) {
    case 'pending':
      return { text: `Asked at ${fmtTime(p.requestedAt, tz)} — waiting for answer`, tone: 'amber' };
    case 'passed':
      return { text: `Confirmed at work at ${fmtTime(p.respondedAt, tz)}`, tone: 'green' };
    case 'failed':
      return {
        text: `Not at work at ${fmtTime(p.respondedAt, tz)}${p.distanceM !== null ? ` (${fmtDistance(p.distanceM)} away)` : ''}`,
        tone: 'red',
      };
    case 'expired':
      return { text: `Did not answer (asked ${fmtTime(p.requestedAt, tz)})`, tone: 'red' };
    default:
      return { text: 'Cancelled', tone: 'gray' };
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
      toast.success('Asked to confirm. They have 15 minutes.');
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
                  {row.needsReview && <Badge tone="violet">Needs your check</Badge>}
                </div>
              </div>
            </div>

            {row.worker.phone ? (
              <div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-2">
                <ButtonAnchor href={telHref(row.worker.phone)} variant="success" size="lg" icon={Phone}>
                  Call {row.worker.phone}
                </ButtonAnchor>
                <ButtonAnchor href={whatsappHref(row.worker.phone)} target="_blank" rel="noreferrer" variant="secondary" size="lg" icon={MessageCircle} aria-label="WhatsApp" className="px-3.5" />
                <ButtonAnchor href={smsHref(row.worker.phone)} variant="secondary" size="lg" icon={MessageSquareText} aria-label="Text message" className="px-3.5" />
              </div>
            ) : (
              <Notice tone="gray" className="mt-5">
                No phone number saved for this person.
              </Notice>
            )}

            <div className="mt-5 divide-y divide-line rounded-2xl bg-surface-2/60 px-4">
              <Kv label="Shift">{shiftLine(row, tz)}</Kv>
              <Kv label="Status">{statusDetail(row, tz)}</Kv>
              {row.entry && <Kv label="Checked in">{`${fmtTime(row.entry.clockInAt, tz)}${row.entry.siteName ? ` · ${row.entry.siteName}` : ''}`}</Kv>}
              {row.entry?.clockOutAt && <Kv label="Checked out">{fmtTime(row.entry.clockOutAt, tz)}</Kv>}
              {row.location && (
                <Kv label="Location">
                  {row.location.kind === 'check' ? 'Confirmed' : row.location.kind === 'out' ? 'At check-out' : 'At check-in'} {fmtTime(row.location.at, tz)}
                  {row.location.accuracy ? ` · ±${row.location.accuracy} m` : ''}
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
                  <button onClick={() => setPhotoOpen(true)} className="overflow-hidden rounded-xl ring-1 ring-line" aria-label="Show photo">
                    <img src={`/api/selfies/${row.selfieId}`} alt={`Photo of ${row.worker.name}`} className="h-40 w-32 object-cover" loading="lazy" />
                  </button>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {row.status === 'on_site' && row.presence?.status !== 'pending' && (
                <Button icon={Radar} loading={askPresence.isPending} onClick={() => askPresence.mutate(row.worker.id)}>
                  Ask to confirm location
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
                {row.entry ? 'Fix attendance' : 'Add attendance'}
              </Button>
              <ButtonLink to={`${m.base}/team/${row.worker.id}`} variant="ghost" icon={UserRound}>
                Profile
              </ButtonLink>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={photoOpen && !!row?.selfieId} onClose={() => setPhotoOpen(false)} title={row?.worker.name} size="sm">
        {row?.selfieId && <img src={`/api/selfies/${row.selfieId}`} alt={`Photo of ${row.worker.name}`} className="w-full rounded-xl" />}
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
