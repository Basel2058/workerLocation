import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, ExternalLink, MapPin, Pencil, Plus, Trash2, Users, Wifi } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { CompanySettings, CompanySummary, CreatedCredentials, Site, UserRecord } from '../../../../shared/types';
import { Dialog, useConfirm } from '../../components/Dialog';
import { MiniMap } from '../../components/maps';
import { useToast } from '../../components/Toast';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  PageLoader,
  Segmented,
  Select,
  Switch,
  Textarea,
} from '../../components/ui';
import { del, errorMessage, get, patch, post } from '../../lib/api';
import { fmtRelative, plural } from '../../lib/format';
import { CredentialsDialog, PeopleTable, PersonDialog } from './People';
import { SiteEditor } from './SiteEditor';

const allTimezones = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
})();
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

function TimezoneInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <>
      <Input id={id} list="tz-list" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Europe/London" spellCheck={false} />
      <datalist id="tz-list">
        {allTimezones.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
    </>
  );
}

export function CompaniesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['dev', 'companies'], queryFn: () => get<CompanySummary[]>('/api/dev/companies') });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [tz, setTz] = useState(browserTz);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await post<CompanySummary>('/api/dev/companies', { name, timezone: tz });
      await qc.invalidateQueries({ queryKey: ['dev'] });
      setOpen(false);
      navigate(`/dev/companies/${c.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Companies"
        description="Each company has its own workplaces, managers and workers."
        actions={
          <Button
            variant="brand"
            icon={Plus}
            onClick={() => {
              setName('');
              setTz(browserTz);
              setError(null);
              setOpen(true);
            }}
          >
            New company
          </Button>
        }
      />
      {q.isPending ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No companies yet" body="Create the first company, add its workplaces, then its managers and workers." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((c) => (
            <ButtonLink
              key={c.id}
              to={`/dev/companies/${c.id}`}
              variant="secondary"
              className="h-auto flex-col items-stretch gap-0 rounded-2xl p-0 text-left font-normal"
            >
              <div className="flex items-start gap-3 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{c.name}</p>
                  <p className="truncate text-[13px] text-muted">
                    {c.timezone} · {c.lastActivityAt ? `active ${fmtRelative(c.lastActivityAt)}` : 'no check-ins yet'}
                  </p>
                </div>
                {!c.active && <Badge tone="gray">Off</Badge>}
                {c.pendingReviews > 0 && <Badge tone="amber">{c.pendingReviews} to review</Badge>}
              </div>
              <div className="grid grid-cols-4 border-t border-line text-center">
                {[
                  ['Workers', c.workers],
                  ['Managers', c.managers],
                  ['Places', c.sites],
                  ['Today', c.punchesToday],
                ].map(([label, n]) => (
                  <div key={label} className="py-2.5">
                    <p className="tabular text-[15px] font-semibold text-ink">{n}</p>
                    <p className="text-[11px] text-muted">{label}</p>
                  </div>
                ))}
              </div>
            </ButtonLink>
          ))}
        </div>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New company"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" loading={busy} disabled={!name.trim() || !tz} onClick={() => void create()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Company name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Time zone" hint="Shifts and reports use the clock of this time zone.">
            <TimezoneInput value={tz} onChange={setTz} />
          </Field>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Dialog>
    </div>
  );
}

type Tab = 'sites' | 'people' | 'settings' | 'company';

export function CompanyDetailPage() {
  const { companyId } = useParams();
  const id = Number(companyId);
  const [tab, setTab] = useState<Tab>('sites');
  const q = useQuery({
    queryKey: ['dev', 'company', id],
    queryFn: () => get<{ company: CompanySummary; sites: Site[] }>(`/api/dev/companies/${id}`),
  });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const { company, sites } = q.data;

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={
          <ButtonLink to="/dev/companies" variant="ghost" size="sm" icon={ArrowLeft} className="-ml-2 mb-2">
            Companies
          </ButtonLink>
        }
        title={company.name}
        description={`${company.timezone} · ${plural(company.workers, 'worker')} · ${plural(company.managers, 'manager')}${company.active ? '' : ' · turned off'}`}
        actions={
          <ButtonLink to={`/c/${company.id}`} variant="brand" icon={ExternalLink}>
            Open dashboard
          </ButtonLink>
        }
      />
      <Segmented
        className="mb-5 w-full sm:w-auto"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sites', label: 'Workplaces', icon: MapPin },
          { value: 'people', label: 'People', icon: Users },
          { value: 'settings', label: 'Rules' },
          { value: 'company', label: 'Company' },
        ]}
      />
      {tab === 'sites' && <SitesTab company={company} sites={sites} />}
      {tab === 'people' && <PeopleTab companyId={company.id} />}
      {tab === 'settings' && <SettingsTab company={company} />}
      {tab === 'company' && <CompanyTab company={company} />}
    </div>
  );
}

function SitesTab({ company, sites }: { company: CompanySummary; sites: Site[] }) {
  const [editing, setEditing] = useState<Site | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">Workers can only check in inside these areas.</p>
        <Button variant="brand" icon={Plus} onClick={() => setAdding(true)}>
          Add workplace
        </Button>
      </div>
      {sites.length === 0 ? (
        <Card>
          <EmptyState icon={MapPin} title="No workplaces yet" body="Add at least one so workers can check in." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <Card key={s.id} className={s.active ? 'overflow-hidden' : 'overflow-hidden opacity-60'}>
              <MiniMap point={null} site={{ lat: s.lat, lng: s.lng, radiusM: s.radiusM, name: s.name }} className="h-40 rounded-none ring-0" />
              <div className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-[13px] text-muted">{s.address || `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="teal">{s.radiusM} m radius</Badge>
                    {s.networks.length > 0 && (
                      <Badge tone={s.requireNetwork ? 'violet' : 'blue'}>
                        <Wifi className="mr-0.5 inline size-3" /> {s.requireNetwork ? 'Wi-Fi required' : 'Wi-Fi known'}
                      </Badge>
                    )}
                    {!s.active && <Badge tone="gray">Off</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(s)}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <SiteEditor
        open={adding || !!editing}
        companyId={company.id}
        site={editing}
        others={sites}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function PeopleTab({ companyId }: { companyId: number }) {
  const [adding, setAdding] = useState<'manager' | 'worker' | null>(null);
  const [creds, setCreds] = useState<CreatedCredentials | null>(null);
  const q = useQuery({
    queryKey: ['dev', 'users', 'company', companyId],
    queryFn: () => get<UserRecord[]>(`/api/dev/users?companyId=${companyId}&includeInactive=1`),
  });
  const managers = useMemo(() => (q.data ?? []).filter((u) => u.role === 'manager'), [q.data]);
  const workers = useMemo(() => (q.data ?? []).filter((u) => u.role === 'worker'), [q.data]);
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} />;
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader title={`Managers (${managers.length})`} actions={<Button size="sm" icon={Plus} onClick={() => setAdding('manager')}>Add manager</Button>} />
        <div className="border-t border-line">
          <PeopleTable people={managers} emptyText="No managers yet" />
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title={`Workers (${workers.length})`} actions={<Button size="sm" variant="brand" icon={Plus} onClick={() => setAdding('worker')}>Add worker</Button>} />
        <div className="border-t border-line">
          <PeopleTable people={workers} emptyText="No workers yet" />
        </div>
      </Card>
      <PersonDialog
        open={!!adding}
        companyId={companyId}
        defaultRole={adding ?? 'worker'}
        onClose={() => setAdding(null)}
        onCreated={(c) => {
          setAdding(null);
          setCreds(c);
        }}
      />
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  unit: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-28" />
        <span className="text-sm text-muted">{unit}</span>
      </div>
    </Field>
  );
}

function SettingsTab({ company }: { company: CompanySummary }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [s, setS] = useState<CompanySettings>(company.settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(company.settings), [company.settings]);
  const set = (p: Partial<CompanySettings>) => setS((cur) => ({ ...cur, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      await patch(`/api/dev/companies/${company.id}`, { settings: s });
      toast.success('Rules saved');
      await qc.invalidateQueries({ queryKey: ['dev'] });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="space-y-5 p-5">
        <h3 className="font-semibold">Check-in checks</h3>
        <Field label="Selfie with every check-in" hint="A quick photo from the front camera stops people checking in for each other.">
          <Select value={s.selfieMode} onChange={(e) => set({ selfieMode: e.target.value as CompanySettings['selfieMode'] })} className="w-auto">
            <option value="always">Always</option>
            <option value="random">Random spot checks</option>
            <option value="off">Never</option>
          </Select>
        </Field>
        {s.selfieMode === 'random' && (
          <NumberField label="How often" hint="Chance that a check-in asks for a photo." value={s.selfieRandomPercent} onChange={(n) => set({ selfieRandomPercent: n })} min={1} max={100} unit="%" />
        )}
        <NumberField
          label="GPS precision needed"
          hint="Reject locations less precise than this. Phones outdoors report 5–20 m."
          value={s.maxAccuracyM}
          onChange={(n) => set({ maxAccuracyM: n })}
          min={10}
          max={2000}
          unit="meters"
        />
        <Field label="Suspicious check-ins" hint="What to do when the app sees signs of a fake location or tampered phone.">
          <Select value={s.highRiskAction} onChange={(e) => set({ highRiskAction: e.target.value as CompanySettings['highRiskAction'] })} className="w-auto">
            <option value="review">Accept, but the manager must confirm</option>
            <option value="reject">Reject</option>
          </Select>
        </Field>
        <Switch
          checked={s.autoApproveFirstDevice}
          onChange={(v) => set({ autoApproveFirstDevice: v })}
          label="Approve a worker’s first phone automatically"
          description="Every later phone always needs a manager’s approval."
        />
      </Card>
      <Card className="space-y-5 p-5">
        <h3 className="font-semibold">Shifts and lateness</h3>
        <NumberField label="Late after" hint="Minutes after the shift starts before someone counts as late." value={s.lateGraceMin} onChange={(n) => set({ lateGraceMin: n })} min={0} max={240} unit="minutes" />
        <NumberField
          label="Earliest check-in"
          hint="How long before a shift a check-in still belongs to that shift."
          value={s.earlyCheckInMin}
          onChange={(n) => set({ earlyCheckInMin: n })}
          min={0}
          max={720}
          unit="minutes"
        />
        <Switch checked={s.allowUnscheduled} onChange={(v) => set({ allowUnscheduled: v })} label="Allow check-ins without a shift" />
        {s.allowUnscheduled && (
          <Switch checked={s.reviewUnscheduled} onChange={(v) => set({ reviewUnscheduled: v })} label="…but send them to the manager to confirm" />
        )}
        <NumberField
          label="Flag a missing check-out"
          hint="Minutes after the shift ends."
          value={s.missingCheckoutAfterMin}
          onChange={(n) => set({ missingCheckoutAfterMin: n })}
          min={0}
          max={1440}
          unit="minutes"
        />
        <NumberField label="Without a shift, flag after" hint="Hours after checking in." value={s.maxOpenHours} onChange={(n) => set({ maxOpenHours: n })} min={1} max={48} unit="hours" />
      </Card>
      <Card className="space-y-5 p-5">
        <h3 className="font-semibold">Privacy</h3>
        <NumberField label="Keep photos for" hint="Older selfies are deleted automatically." value={s.photoRetentionDays} onChange={(n) => set({ photoRetentionDays: n })} min={1} max={3650} unit="days" />
      </Card>
      <div className="flex justify-end">
        <Button variant="brand" size="lg" loading={busy} onClick={() => void save()}>
          Save rules
        </Button>
      </div>
    </div>
  );
}

function CompanyTab({ company }: { company: CompanySummary }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [name, setName] = useState(company.name);
  const [tz, setTz] = useState(company.timezone);
  const [notes, setNotes] = useState(company.notes);
  const [busy, setBusy] = useState(false);
  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await patch(`/api/dev/companies/${company.id}`, { name, timezone: tz, notes, ...extra });
      toast.success('Saved');
      await qc.invalidateQueries({ queryKey: ['dev'] });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="space-y-4 p-5">
        <Field label="Company name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Time zone" hint="Changing it changes how existing shift times are shown.">
          <TimezoneInput value={tz} onChange={setTz} />
        </Field>
        <Field label="Notes (only you see these)" optional>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button variant="brand" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </Card>
      <Card className="space-y-4 p-5 ring-rose-500/30">
        <h3 className="font-semibold text-rose-700 dark:text-rose-300">Danger zone</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{company.active ? 'Turn the company off' : 'Turn the company on'}</p>
            <p className="text-[13px] text-muted">Managers and workers cannot sign in while it is off. Nothing is deleted.</p>
          </div>
          <Button variant={company.active ? 'dangerSoft' : 'secondary'} onClick={() => void save({ active: !company.active })}>
            {company.active ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium">Delete the company</p>
            <p className="text-[13px] text-muted">Deletes all its people, workplaces, shifts, check-ins and photos forever.</p>
          </div>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${company.name}?`,
                body: 'This cannot be undone. Download a backup first if you might need the data.',
                confirmText: 'Delete forever',
                variant: 'danger',
                typeToConfirm: company.name,
              });
              if (!ok) return;
              try {
                await del(`/api/dev/companies/${company.id}`, { confirmName: company.name });
                toast.success('Company deleted');
                await qc.invalidateQueries({ queryKey: ['dev'] });
                navigate('/dev/companies');
              } catch (err) {
                toast.error(err);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Card>
    </div>
  );
}
