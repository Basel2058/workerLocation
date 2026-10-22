import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, KeyRound, LogOut, MessageCircle, Plus, Search, ShieldOff, Smartphone, Trash2, Unlock, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LOCALE_INFO, LOCALES, type Locale } from '../../../../shared/i18n';
import type { CompanySummary, CreatedCredentials, Device, Role, UserRecord } from '../../../../shared/types';
import { Dialog, useConfirm } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  ButtonAnchor,
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
  Select,
  Switch,
  Textarea,
} from '../../components/ui';
import { del, errorMessage, get, patch, post, qs } from '../../lib/api';
import { usePublicConfig } from '../../lib/auth';
import { fmtDateTime, fmtRelative, whatsappHref } from '../../lib/format';
import { getLocale, t, translate, tRich, useLoadedLocale } from '../../lib/i18n';
import { deviceBadge } from '../manager/Team';
import { roleLabel } from './util';

const ROLE_TONE = { developer: 'violet', manager: 'blue', worker: 'gray' } as const;

function suggestUsername(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  if (ascii.length === 0) return '';
  return (ascii.length > 1 ? `${ascii[0]}.${ascii[ascii.length - 1]}` : ascii[0]!).slice(0, 40);
}

/** Shows new login details once, with easy ways to pass them on. */
export function CredentialsDialog({ creds, onClose }: { creds: CreatedCredentials | null; onClose: () => void }) {
  const toast = useToast();
  const config = usePublicConfig();
  // The login message is written in the account's language; the dialog itself stays in the app's.
  const lang = useLoadedLocale(creds?.user.locale ?? getLocale());
  if (!creds) return <Dialog open={false} onClose={onClose} />;
  const url = window.location.origin;
  const message = translate(lang, 'dev.credentials.message', {
    name: creds.user.fullName.split(' ')[0],
    app: config?.appName ?? 'OnSite',
    url,
    username: creds.user.username,
    password: creds.password,
  });
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('common.copied', { what }));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('dev.credentials.title')}
      description={t('dev.credentials.description')}
      footer={
        <>
          {creds.user.phone && (
            <ButtonAnchor href={`${whatsappHref(creds.user.phone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" icon={MessageCircle}>
              {t('dev.credentials.whatsapp')}
            </ButtonAnchor>
          )}
          <Button icon={Copy} onClick={() => void copy(message, t('dev.credentials.messageName'))}>
            {t('dev.credentials.copyMessage')}
          </Button>
          <Button variant="brand" onClick={onClose}>
            {t('common.done')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {[
          [t('dev.credentials.username'), creds.user.username],
          [t('dev.credentials.password'), creds.password],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{label}</p>
              <p className="truncate font-mono text-lg font-semibold select-all">
                <Ltr>{value}</Ltr>
              </p>
            </div>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copy(value!, label!)}>
              {t('common.copy')}
            </Button>
          </div>
        ))}
        <p className="text-[13px] text-muted">{tRich('dev.credentials.address', { url: <Ltr className="font-medium text-ink">{url}</Ltr> })}</p>
      </div>
    </Dialog>
  );
}

/** Create a person. `companyId` fixes the company (from a company page). */
export function PersonDialog({
  open,
  onClose,
  companyId,
  companyLanguage,
  defaultRole = 'worker',
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId?: number;
  /** Language of that company: new accounts start in it. */
  companyLanguage?: Locale;
  defaultRole?: Role;
  onCreated: (c: CreatedCredentials) => void;
}) {
  const qc = useQueryClient();
  const companies = useQuery({ queryKey: ['dev', 'companies'], queryFn: () => get<CompanySummary[]>('/api/dev/companies'), enabled: open && !companyId });
  const [role, setRole] = useState<Role>(defaultRole);
  const [company, setCompany] = useState<number>(companyId ?? 0);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(defaultRole !== 'worker');
  const [notes, setNotes] = useState('');
  const [language, setLanguage] = useState<Locale | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRole(defaultRole);
    setCompany(companyId ?? 0);
    setFullName('');
    setUsername('');
    setUsernameTouched(false);
    setPhone('');
    setEmployeeCode('');
    setPassword('');
    setMustChange(defaultRole !== 'worker');
    setNotes('');
    setLanguage(null);
    setError(null);
  }, [open, companyId, defaultRole]);

  // Until a language is picked, the account gets its company's language (the app's for owners).
  const companyLocale = role === 'developer' ? undefined : (companyLanguage ?? companies.data?.find((c) => c.id === company)?.settings.language);
  const locale = language ?? companyLocale ?? getLocale();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await post<CreatedCredentials>('/api/dev/users', {
        role,
        companyId: role === 'developer' ? null : company,
        username,
        fullName,
        phone,
        employeeCode,
        notes,
        locale,
        password: password || undefined,
        mustChangePassword: mustChange,
      });
      await qc.invalidateQueries({ queryKey: ['dev'] });
      onCreated(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const valid = fullName.trim() && username.trim().length >= 3 && (role === 'developer' || company);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('dev.people.dialogTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="brand" loading={busy} disabled={!valid} onClick={() => void submit()}>
            {t('dev.people.createAccount')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('dev.people.role')}>
            <Select
              value={role}
              onChange={(e) => {
                const r = e.target.value as Role;
                setRole(r);
                setMustChange(r !== 'worker');
              }}
            >
              <option value="worker">{t('common.roles.worker')}</option>
              <option value="manager">{t('common.roles.manager')}</option>
              {!companyId && <option value="developer">{t('dev.people.ownerOption')}</option>}
            </Select>
          </Field>
          {!companyId && role !== 'developer' && (
            <Field label={t('dev.people.company')}>
              <Select value={company} onChange={(e) => setCompany(Number(e.target.value))}>
                <option value={0}>{t('dev.people.choose')}</option>
                {(companies.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t('dev.people.language')} hint={t('dev.people.languageHint')}>
            <Select value={locale} onChange={(e) => setLanguage(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_INFO[l].name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('dev.people.fullName')}>
          <Input
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (!usernameTouched) setUsername(suggestUsername(e.target.value));
            }}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('dev.people.username')} hint={t('dev.people.usernameHint')}>
            <Input
              value={username}
              dir="ltr"
              className="rtl:text-right"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase());
                setUsernameTouched(true);
              }}
            />
          </Field>
          <Field label={t('dev.people.phone')} hint={t('dev.people.phoneHint')}>
            <Input
              type="tel"
              dir="ltr"
              className="rtl:text-right"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+962 79 123 4567"
            />
          </Field>
        </div>
        {role === 'worker' && (
          <Field label={t('dev.people.employeeCode')} optional>
            <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          </Field>
        )}
        <Field label={t('dev.people.password')} hint={t('dev.people.passwordHint')} optional>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" dir="ltr" className="rtl:text-right" />
        </Field>
        <Switch checked={mustChange} onChange={setMustChange} label={t('dev.people.mustChange')} />
        <Field label={t('dev.people.notes')} optional>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      </div>
    </Dialog>
  );
}

export function PeopleTable({ people, emptyText }: { people: UserRecord[]; emptyText: string }) {
  if (people.length === 0) return <EmptyState title={emptyText} />;
  return (
    <div className="divide-y divide-line">
      {people.map((u) => (
        <ButtonLink
          key={u.id}
          to={`/dev/people/${u.id}`}
          variant="ghost"
          className="h-auto w-full justify-start gap-3 rounded-none px-5 py-3 text-start font-normal"
        >
          <Avatar name={u.fullName} size={36} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">{u.fullName}</span>
              <Badge tone={ROLE_TONE[u.role]}>{roleLabel(u.role)}</Badge>
              {!u.active && <Badge tone="gray">{t('dev.people.off')}</Badge>}
              {u.locked && <Badge tone="red">{t('dev.people.locked')}</Badge>}
            </span>
            <span className="block truncate text-[13px] text-muted">
              <Ltr>@{u.username}</Ltr>
              {u.companyName && (
                <>
                  {' · '}
                  <bdi>{u.companyName}</bdi>
                </>
              )}
              {u.phone && (
                <>
                  {' · '}
                  <Ltr>{u.phone}</Ltr>
                </>
              )}
            </span>
          </span>
          <span className="hidden text-end text-xs text-muted sm:block">
            {u.role === 'worker'
              ? u.activeDevice
                ? u.activeDevice.label
                : u.pendingDevices
                  ? t('dev.people.phoneWaiting')
                  : t('dev.people.noPhone')
              : u.totpEnabled
                ? t('dev.people.twoStepOn')
                : ''}
            <span className="block">{u.lastSeenAt ? t('dev.people.seen', { when: fmtRelative(u.lastSeenAt) }) : t('dev.people.neverSignedIn')}</span>
          </span>
        </ButtonLink>
      ))}
    </div>
  );
}

export function PeoplePage() {
  const [role, setRole] = useState<'' | Role>('');
  const [companyId, setCompanyId] = useState(0);
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creds, setCreds] = useState<CreatedCredentials | null>(null);
  const companies = useQuery({ queryKey: ['dev', 'companies'], queryFn: () => get<CompanySummary[]>('/api/dev/companies') });
  const people = useQuery({
    queryKey: ['dev', 'users', role, companyId, q, inactive],
    queryFn: () => get<UserRecord[]>(`/api/dev/users${qs({ role, companyId: companyId || undefined, q: q.trim() || undefined, includeInactive: inactive })}`),
    placeholderData: (prev) => prev,
  });
  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t('dev.people.title')}
        description={t('dev.people.description')}
        actions={
          <Button variant="brand" icon={Plus} onClick={() => setAdding(true)}>
            {t('dev.people.add')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-faint" />
          <Input placeholder={t('dev.people.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" />
        </div>
        <Select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value))} className="w-auto" aria-label={t('dev.list.company')}>
          <option value={0}>{t('dev.list.allCompanies')}</option>
          {(companies.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={role} onChange={(e) => setRole(e.target.value as '' | Role)} className="w-auto" aria-label={t('dev.people.role')}>
          <option value="">{t('dev.people.allRoles')}</option>
          <option value="worker">{t('dev.people.workers')}</option>
          <option value="manager">{t('dev.people.managers')}</option>
          <option value="developer">{t('dev.people.owners')}</option>
        </Select>
        <label className="ms-1 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
          {t('dev.people.showInactive')}
        </label>
      </div>
      <Card className="overflow-hidden">
        {people.isPending ? (
          <PageLoader />
        ) : people.isError ? (
          <ErrorBox error={people.error} />
        ) : (
          <PeopleTable people={people.data} emptyText={t('dev.people.nobodyFound')} />
        )}
      </Card>
      <PersonDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(c) => {
          setAdding(false);
          setCreds(c);
        }}
      />
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

export function PersonDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({
    queryKey: ['dev', 'user', userId],
    queryFn: () => get<{ user: UserRecord; devices: Device[] }>(`/api/dev/users/${userId}`),
  });
  const companyId = q.data?.user.companyId;
  const companies = useQuery({ queryKey: ['dev', 'companies'], queryFn: () => get<CompanySummary[]>('/api/dev/companies'), enabled: !!companyId });
  const [form, setForm] = useState<{
    fullName: string;
    username: string;
    phone: string;
    employeeCode: string;
    notes: string;
    locale: Locale | null;
  } | null>(null);
  const [creds, setCreds] = useState<CreatedCredentials | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = q.data?.user;
    if (u) setForm({ fullName: u.fullName, username: u.username, phone: u.phone, employeeCode: u.employeeCode, notes: u.notes, locale: u.locale });
  }, [q.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['dev'] });
  const act = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      toast.success(message);
      await refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  if (q.isPending || !form) return <PageLoader />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const { user, devices } = q.data;
  // Accounts without a language yet show (and save) their company's, like new accounts.
  const locale = form.locale ?? companies.data?.find((c) => c.id === user.companyId)?.settings.language ?? getLocale();

  const save = async () => {
    setSaving(true);
    try {
      await patch(`/api/dev/users/${user.id}`, { ...form, locale });
      toast.success(t('dev.people.saved'));
      await refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={
          <ButtonLink to="/dev/people" variant="ghost" size="sm" icon={ArrowLeft} className="-ms-2 mb-2">
            {t('dev.people.title')}
          </ButtonLink>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.fullName} size={44} />
            {user.fullName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={ROLE_TONE[user.role]}>{roleLabel(user.role)}</Badge>
            {user.companyName && <bdi>{user.companyName}</bdi>}
            {!user.active && <Badge tone="gray">{t('dev.people.turnedOff')}</Badge>}
            {user.locked && <Badge tone="red">{t('dev.people.lockedLong')}</Badge>}
          </span>
        }
        actions={
          user.role === 'worker' && user.companyId ? (
            <ButtonLink to={`/c/${user.companyId}/team/${user.id}`}>{t('dev.people.openInDashboard')}</ButtonLink>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title={t('dev.people.profile')} />
          <div className="space-y-4 border-t border-line p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('dev.people.fullName')}>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </Field>
              <Field label={t('dev.people.username')}>
                <Input
                  value={form.username}
                  dir="ltr"
                  className="rtl:text-right"
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                />
              </Field>
              <Field label={t('dev.people.phone')}>
                <Input type="tel" dir="ltr" className="rtl:text-right" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label={t('dev.people.employeeCode')} optional>
                <Input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
              </Field>
              <Field label={t('dev.people.language')}>
                <Select value={locale} onChange={(e) => setForm({ ...form, locale: e.target.value as Locale })}>
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_INFO[l].name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('dev.people.notes')} optional>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end">
              <Button variant="brand" loading={saving} onClick={() => void save()}>
                {t('dev.people.saveChanges')}
              </Button>
            </div>
            <p className="text-xs text-muted">
              {t('dev.people.created', { date: fmtDateTime(user.createdAt, 'UTC') })} ·{' '}
              {user.lastLoginAt ? t('dev.people.lastSignIn', { when: fmtRelative(user.lastLoginAt) }) : t('dev.people.neverSignedIn')}
            </p>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t('dev.people.access')} />
            <div className="grid gap-2 border-t border-line p-5">
              <Button
                icon={KeyRound}
                className="justify-start"
                onClick={async () => {
                  const ok = await confirm({
                    title: t('dev.people.resetTitle', { name: user.fullName }),
                    body: t('dev.people.resetBody'),
                    confirmText: t('dev.people.resetPassword'),
                  });
                  if (ok) {
                    try {
                      setCreds(await post<CreatedCredentials>(`/api/dev/users/${user.id}/reset-password`, { mustChangePassword: user.role !== 'worker' }));
                      await refresh();
                    } catch (err) {
                      toast.error(err);
                    }
                  }
                }}
              >
                {t('dev.people.resetPassword')}
              </Button>
              {user.locked && (
                <Button icon={Unlock} className="justify-start" onClick={() => void act(() => post(`/api/dev/users/${user.id}/unlock`), t('dev.people.unlocked'))}>
                  {t('dev.people.unlock')}
                </Button>
              )}
              <Button
                icon={LogOut}
                className="justify-start"
                onClick={() => void act(() => post(`/api/dev/users/${user.id}/logout-everywhere`), t('dev.people.signedOutEverywhere'))}
              >
                {t('dev.people.signOutEverywhere')}
              </Button>
              {user.totpEnabled && (
                <Button
                  icon={ShieldOff}
                  className="justify-start"
                  onClick={() => void act(() => post(`/api/dev/users/${user.id}/reset-2fa`), t('dev.people.twoStepTurnedOff'))}
                >
                  {t('dev.people.turnOffTwoStep')}
                </Button>
              )}
              <Button
                icon={user.active ? UserRoundX : UserRoundCheck}
                className="justify-start"
                variant={user.active ? 'dangerSoft' : 'secondary'}
                onClick={() =>
                  void act(
                    () => patch(`/api/dev/users/${user.id}`, { active: !user.active }),
                    user.active ? t('dev.people.accountTurnedOff') : t('dev.people.accountTurnedOn'),
                  )
                }
              >
                {user.active ? t('dev.people.turnAccountOff') : t('dev.people.turnAccountOn')}
              </Button>
              <Button
                icon={Trash2}
                variant="dangerSoft"
                className="justify-start"
                onClick={async () => {
                  const ok = await confirm({
                    title: t('dev.people.deleteTitle', { name: user.fullName }),
                    body: t('dev.people.deleteBody'),
                    confirmText: t('dev.people.deleteForever'),
                    variant: 'danger',
                    typeToConfirm: user.username,
                  });
                  if (!ok) return;
                  try {
                    await del(`/api/dev/users/${user.id}`, { confirmUsername: user.username });
                    toast.success(t('dev.people.deleted'));
                    await refresh();
                    navigate('/dev/people');
                  } catch (err) {
                    toast.error(err);
                  }
                }}
              >
                {t('dev.people.deleteAccount')}
              </Button>
            </div>
          </Card>

          {user.role === 'worker' && (
            <Card>
              <CardHeader title={t('dev.people.phones')} description={t('dev.people.phonesHint')} />
              <div className="divide-y divide-line border-t border-line">
                {devices.length === 0 && <p className="px-5 py-4 text-sm text-muted">{t('dev.people.noPhones')}</p>}
                {devices.map((d) => (
                  <div key={d.id} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Smartphone className="size-5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.label}</p>
                        <p className="truncate text-xs text-muted" title={d.userAgent}>
                          {fmtDateTime(d.createdAt, 'UTC')} UTC
                          {d.lastUsedAt ? ` · ${t('dev.people.deviceUsed', { when: fmtRelative(d.lastUsedAt) })}` : ''}
                          {d.decidedByName ? ` · ${t('dev.people.deviceDecidedBy', { name: d.decidedByName })}` : ''}
                        </p>
                      </div>
                      {deviceBadge(d.status)}
                    </div>
                    {(d.status === 'active' || d.status === 'pending') && (
                      <div className="mt-2 ms-8 flex gap-2">
                        {d.status === 'pending' && (
                          <Button size="xs" variant="success" onClick={() => void act(() => post(`/api/dev/devices/${d.id}/approve`), t('dev.people.approved'))}>
                            {t('dev.people.approve')}
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="dangerSoft"
                          onClick={() => void act(() => post(`/api/dev/devices/${d.id}/${d.status === 'pending' ? 'reject' : 'revoke'}`), t('dev.people.deviceDone'))}
                        >
                          {d.status === 'pending' ? t('dev.people.reject') : t('dev.people.remove')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
}
