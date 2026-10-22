import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, ExternalLink, MapPin, Pencil, Plus, Trash2, Users, Wifi } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LOCALE_INFO, LOCALES, type Locale } from '../../../../shared/i18n';
import type { CompanySettings, CompanySummary, CreatedCredentials, Site, UserRecord, WeekStart } from '../../../../shared/types';
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
  Ltr,
  PageHeader,
  PageLoader,
  Segmented,
  Select,
  Switch,
  Textarea,
} from '../../components/ui';
import { del, errorMessage, get, patch, post } from '../../lib/api';
import { fmtDistance, fmtRelative, fmtWeekday } from '../../lib/format';
import { t } from '../../lib/i18n';
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
      <Input
        id={id}
        list="tz-list"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Europe/London" // i18n-ignore (a time zone name)
        spellCheck={false}
        dir="ltr"
        className="rtl:text-right"
      />
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
        title={t('dev.companies.title')}
        description={t('dev.companies.description')}
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
            {t('dev.companies.new')}
          </Button>
        }
      />
      {q.isPending ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title={t('dev.companies.emptyTitle')} body={t('dev.companies.emptyBody')} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((c) => (
            <ButtonLink
              key={c.id}
              to={`/dev/companies/${c.id}`}
              variant="secondary"
              className="h-auto flex-col items-stretch gap-0 rounded-2xl p-0 text-start font-normal"
            >
              <div className="flex items-start gap-3 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{c.name}</p>
                  <p className="truncate text-[13px] text-muted">
                    <Ltr>{c.timezone}</Ltr> ·{' '}
                    {c.lastActivityAt ? t('dev.companies.lastActive', { when: fmtRelative(c.lastActivityAt) }) : t('dev.companies.noPunches')}
                  </p>
                </div>
                {!c.active && <Badge tone="gray">{t('dev.companies.off')}</Badge>}
                {c.pendingReviews > 0 && <Badge tone="amber">{t('dev.companies.toReview', { count: c.pendingReviews })}</Badge>}
              </div>
              <div className="grid grid-cols-4 border-t border-line text-center">
                {[
                  [t('dev.companies.stats.workers'), c.workers],
                  [t('dev.companies.stats.managers'), c.managers],
                  [t('dev.companies.stats.places'), c.sites],
                  [t('dev.companies.stats.today'), c.punchesToday],
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
        title={t('dev.companies.new')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="brand" loading={busy} disabled={!name.trim() || !tz} onClick={() => void create()}>
              {t('dev.companies.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('dev.companies.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label={t('dev.companies.timezone')} hint={t('dev.companies.timezoneHint')}>
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
          <ButtonLink to="/dev/companies" variant="ghost" size="sm" icon={ArrowLeft} className="-ms-2 mb-2">
            {t('dev.companies.title')}
          </ButtonLink>
        }
        title={<bdi>{company.name}</bdi>}
        description={
          <>
            <Ltr>{company.timezone}</Ltr> · {t('dev.companies.workers', { count: company.workers })} ·{' '}
            {t('dev.companies.managers', { count: company.managers })}
            {company.active ? '' : ` · ${t('dev.companies.turnedOff')}`}
          </>
        }
        actions={
          <ButtonLink to={`/c/${company.id}`} variant="brand" icon={ExternalLink}>
            {t('dev.companies.openDashboard')}
          </ButtonLink>
        }
      />
      <Segmented
        className="mb-5 w-full sm:w-auto"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sites', label: t('dev.companies.tabs.sites'), icon: MapPin },
          { value: 'people', label: t('dev.companies.tabs.people'), icon: Users },
          { value: 'settings', label: t('dev.companies.tabs.rules') },
          { value: 'company', label: t('dev.companies.tabs.company') },
        ]}
      />
      {tab === 'sites' && <SitesTab company={company} sites={sites} />}
      {tab === 'people' && <PeopleTab companyId={company.id} language={company.settings.language} />}
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
        <p className="text-sm text-muted">{t('dev.sites.intro')}</p>
        <Button variant="brand" icon={Plus} onClick={() => setAdding(true)}>
          {t('dev.sites.add')}
        </Button>
      </div>
      {sites.length === 0 ? (
        <Card>
          <EmptyState icon={MapPin} title={t('dev.sites.emptyTitle')} body={t('dev.sites.emptyBody')} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <Card key={s.id} className={s.active ? 'overflow-hidden' : 'overflow-hidden opacity-60'}>
              <MiniMap point={null} site={{ lat: s.lat, lng: s.lng, radiusM: s.radiusM, name: s.name }} className="h-40 rounded-none ring-0" />
              <div className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-[13px] text-muted">{s.address || <Ltr>{`${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}</Ltr>}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="teal">{t('dev.sites.radius', { distance: fmtDistance(s.radiusM) })}</Badge>
                    {s.networks.length > 0 && (
                      <Badge tone={s.requireNetwork ? 'violet' : 'blue'}>
                        <Wifi className="me-0.5 inline size-3" /> {s.requireNetwork ? t('dev.sites.wifiRequired') : t('dev.sites.wifiKnown')}
                      </Badge>
                    )}
                    {!s.active && <Badge tone="gray">{t('dev.sites.off')}</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(s)}>
                  {t('common.edit')}
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

function PeopleTab({ companyId, language }: { companyId: number; language: Locale }) {
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
        <CardHeader
          title={t('dev.companies.managersCount', { count: managers.length })}
          actions={
            <Button size="sm" icon={Plus} onClick={() => setAdding('manager')}>
              {t('dev.companies.addManager')}
            </Button>
          }
        />
        <div className="border-t border-line">
          <PeopleTable people={managers} emptyText={t('dev.companies.noManagers')} />
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader
          title={t('dev.companies.workersCount', { count: workers.length })}
          actions={
            <Button size="sm" variant="brand" icon={Plus} onClick={() => setAdding('worker')}>
              {t('dev.companies.addWorker')}
            </Button>
          }
        />
        <div className="border-t border-line">
          <PeopleTable people={workers} emptyText={t('dev.companies.noWorkers')} />
        </div>
      </Card>
      <PersonDialog
        open={!!adding}
        companyId={companyId}
        companyLanguage={language}
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

/** The days a company week can start on, with a sample date of that weekday (for its name in the app language). */
const WEEK_STARTS: Array<[WeekStart, string]> = [
  [0, '2024-01-07'],
  [1, '2024-01-01'],
  [6, '2024-01-06'],
];

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
      toast.success(t('dev.rules.saved'));
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
        <h3 className="font-semibold">{t('dev.rules.checks')}</h3>
        <Field label={t('dev.rules.selfie')} hint={t('dev.rules.selfieHint')}>
          <Select value={s.selfieMode} onChange={(e) => set({ selfieMode: e.target.value as CompanySettings['selfieMode'] })} className="w-auto">
            <option value="always">{t('dev.rules.selfieAlways')}</option>
            <option value="random">{t('dev.rules.selfieRandom')}</option>
            <option value="off">{t('dev.rules.selfieOff')}</option>
          </Select>
        </Field>
        {s.selfieMode === 'random' && (
          <NumberField
            label={t('dev.rules.howOften')}
            hint={t('dev.rules.howOftenHint')}
            value={s.selfieRandomPercent}
            onChange={(n) => set({ selfieRandomPercent: n })}
            min={1}
            max={100}
            unit="%"
          />
        )}
        <NumberField
          label={t('dev.rules.accuracy')}
          hint={t('dev.rules.accuracyHint')}
          value={s.maxAccuracyM}
          onChange={(n) => set({ maxAccuracyM: n })}
          min={10}
          max={2000}
          unit={t('dev.rules.units.meters', { count: s.maxAccuracyM })}
        />
        <Field label={t('dev.rules.highRisk')} hint={t('dev.rules.highRiskHint')}>
          <Select value={s.highRiskAction} onChange={(e) => set({ highRiskAction: e.target.value as CompanySettings['highRiskAction'] })} className="w-auto">
            <option value="review">{t('dev.rules.highRiskReview')}</option>
            <option value="reject">{t('dev.rules.highRiskReject')}</option>
          </Select>
        </Field>
        <Switch
          checked={s.autoApproveFirstDevice}
          onChange={(v) => set({ autoApproveFirstDevice: v })}
          label={t('dev.rules.autoApprove')}
          description={t('dev.rules.autoApproveHint')}
        />
      </Card>
      <Card className="space-y-5 p-5">
        <h3 className="font-semibold">{t('dev.rules.shifts')}</h3>
        <NumberField
          label={t('dev.rules.lateAfter')}
          hint={t('dev.rules.lateAfterHint')}
          value={s.lateGraceMin}
          onChange={(n) => set({ lateGraceMin: n })}
          min={0}
          max={240}
          unit={t('dev.rules.units.minutes', { count: s.lateGraceMin })}
        />
        <NumberField
          label={t('dev.rules.earlyCheckIn')}
          hint={t('dev.rules.earlyCheckInHint')}
          value={s.earlyCheckInMin}
          onChange={(n) => set({ earlyCheckInMin: n })}
          min={0}
          max={720}
          unit={t('dev.rules.units.minutes', { count: s.earlyCheckInMin })}
        />
        <Switch checked={s.allowUnscheduled} onChange={(v) => set({ allowUnscheduled: v })} label={t('dev.rules.allowUnscheduled')} />
        {s.allowUnscheduled && (
          <Switch checked={s.reviewUnscheduled} onChange={(v) => set({ reviewUnscheduled: v })} label={t('dev.rules.reviewUnscheduled')} />
        )}
        <NumberField
          label={t('dev.rules.missingCheckout')}
          hint={t('dev.rules.missingCheckoutHint')}
          value={s.missingCheckoutAfterMin}
          onChange={(n) => set({ missingCheckoutAfterMin: n })}
          min={0}
          max={1440}
          unit={t('dev.rules.units.minutes', { count: s.missingCheckoutAfterMin })}
        />
        <NumberField
          label={t('dev.rules.maxOpen')}
          hint={t('dev.rules.maxOpenHint')}
          value={s.maxOpenHours}
          onChange={(n) => set({ maxOpenHours: n })}
          min={1}
          max={48}
          unit={t('dev.rules.units.hours', { count: s.maxOpenHours })}
        />
        <Field label={t('dev.rules.weekStart')} hint={t('dev.rules.weekStartHint')}>
          <Select value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: Number(e.target.value) as WeekStart })} className="w-auto">
            {WEEK_STARTS.map(([day, date]) => (
              <option key={day} value={day}>
                {fmtWeekday(date, 'long')}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      <Card className="space-y-5 p-5">
        <h3 className="font-semibold">{t('dev.rules.privacy')}</h3>
        <NumberField
          label={t('dev.rules.photoRetention')}
          hint={t('dev.rules.photoRetentionHint')}
          value={s.photoRetentionDays}
          onChange={(n) => set({ photoRetentionDays: n })}
          min={1}
          max={3650}
          unit={t('dev.rules.units.days', { count: s.photoRetentionDays })}
        />
      </Card>
      <Card className="space-y-5 p-5">
        <h3 className="font-semibold">{t('dev.rules.languageTitle')}</h3>
        <Field label={t('dev.rules.language')} hint={t('dev.rules.languageHint')}>
          <Select value={s.language} onChange={(e) => set({ language: e.target.value as Locale })} className="w-auto">
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_INFO[l].name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      <div className="flex justify-end">
        <Button variant="brand" size="lg" loading={busy} onClick={() => void save()}>
          {t('dev.rules.save')}
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
      toast.success(t('dev.companies.saved'));
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
        <Field label={t('dev.companies.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('dev.companies.timezone')} hint={t('dev.companies.timezoneChangeHint')}>
          <TimezoneInput value={tz} onChange={setTz} />
        </Field>
        <Field label={t('dev.companies.notes')} optional>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button variant="brand" loading={busy} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </div>
      </Card>
      <Card className="space-y-4 p-5 ring-rose-500/30">
        <h3 className="font-semibold text-rose-700 dark:text-rose-300">{t('dev.companies.dangerZone')}</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{company.active ? t('dev.companies.turnOffTitle') : t('dev.companies.turnOnTitle')}</p>
            <p className="text-[13px] text-muted">{t('dev.companies.offExplained')}</p>
          </div>
          <Button variant={company.active ? 'dangerSoft' : 'secondary'} onClick={() => void save({ active: !company.active })}>
            {company.active ? t('dev.companies.turnOff') : t('dev.companies.turnOn')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-sm font-medium">{t('dev.companies.deleteTitle')}</p>
            <p className="text-[13px] text-muted">{t('dev.companies.deleteExplained')}</p>
          </div>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              const ok = await confirm({
                title: t('dev.companies.confirmDeleteTitle', { name: company.name }),
                body: t('dev.companies.confirmDeleteBody'),
                confirmText: t('dev.companies.deleteForever'),
                variant: 'danger',
                typeToConfirm: company.name,
              });
              if (!ok) return;
              try {
                await del(`/api/dev/companies/${company.id}`, { confirmName: company.name });
                toast.success(t('dev.companies.deleted'));
                await qc.invalidateQueries({ queryKey: ['dev'] });
                navigate('/dev/companies');
              } catch (err) {
                toast.error(err);
              }
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
