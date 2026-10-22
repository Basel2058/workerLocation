import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, KeyRound, LogOut, MessageCircle, Plus, Search, ShieldOff, Smartphone, Trash2, Unlock, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
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
  PageHeader,
  PageLoader,
  Select,
  Switch,
  Textarea,
} from '../../components/ui';
import { del, errorMessage, get, patch, post, qs } from '../../lib/api';
import { usePublicConfig } from '../../lib/auth';
import { fmtDateTime, fmtRelative, whatsappHref } from '../../lib/format';
import { deviceBadge } from '../manager/Team';

export const ROLE_LABEL: Record<Role, string> = { developer: 'Owner', manager: 'Manager', worker: 'Worker' };
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
  if (!creds) return <Dialog open={false} onClose={onClose} />;
  const url = window.location.origin;
  const message = `Hi ${creds.user.fullName.split(' ')[0]}, here is your login for ${config?.appName ?? 'OnSite'}:\n${url}\nUsername: ${creds.user.username}\nPassword: ${creds.password}`;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Copy did not work — select the text instead.');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Login details"
      description="Shown only now. Give them to the person privately."
      footer={
        <>
          {creds.user.phone && (
            <ButtonAnchor href={`${whatsappHref(creds.user.phone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" icon={MessageCircle}>
              Send on WhatsApp
            </ButtonAnchor>
          )}
          <Button icon={Copy} onClick={() => void copy(message, 'Message')}>
            Copy message
          </Button>
          <Button variant="brand" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {[
          ['Username', creds.user.username],
          ['Password', creds.password],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{label}</p>
              <p className="truncate font-mono text-lg font-semibold select-all">{value}</p>
            </div>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copy(value!, label!)}>
              Copy
            </Button>
          </div>
        ))}
        <p className="text-[13px] text-muted">
          Sign-in address: <span className="font-medium text-ink">{url}</span>
        </p>
      </div>
    </Dialog>
  );
}

/** Create a person. `companyId` fixes the company (from a company page). */
export function PersonDialog({
  open,
  onClose,
  companyId,
  defaultRole = 'worker',
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId?: number;
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
    setError(null);
  }, [open, companyId, defaultRole]);

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
      title="Add a person"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" loading={busy} disabled={!valid} onClick={() => void submit()}>
            Create account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select
              value={role}
              onChange={(e) => {
                const r = e.target.value as Role;
                setRole(r);
                setMustChange(r !== 'worker');
              }}
            >
              <option value="worker">Worker</option>
              <option value="manager">Manager</option>
              {!companyId && <option value="developer">Owner (developer)</option>}
            </Select>
          </Field>
          {!companyId && role !== 'developer' && (
            <Field label="Company">
              <Select value={company} onChange={(e) => setCompany(Number(e.target.value))}>
                <option value={0}>Choose…</option>
                {(companies.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Full name">
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
          <Field label="Username" hint="Letters, numbers, dots or dashes.">
            <Input
              value={username}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase());
                setUsernameTouched(true);
              }}
            />
          </Field>
          <Field label="Phone number" hint="Managers call this number.">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+962 79 123 4567" />
          </Field>
        </div>
        {role === 'worker' && (
          <Field label="Employee number" optional>
            <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          </Field>
        )}
        <Field label="Password" hint="Leave empty to create a random one that is easy to type on a phone." optional>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Switch checked={mustChange} onChange={setMustChange} label="Ask for a new password at first sign-in" />
        <Field label="Notes" optional>
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
          className="h-auto w-full justify-start gap-3 rounded-none px-5 py-3 text-left font-normal"
        >
          <Avatar name={u.fullName} size={36} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">{u.fullName}</span>
              <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
              {!u.active && <Badge tone="gray">Off</Badge>}
              {u.locked && <Badge tone="red">Locked</Badge>}
            </span>
            <span className="block truncate text-[13px] text-muted">
              @{u.username}
              {u.companyName ? ` · ${u.companyName}` : ''}
              {u.phone ? ` · ${u.phone}` : ''}
            </span>
          </span>
          <span className="hidden text-right text-xs text-muted sm:block">
            {u.role === 'worker' ? (u.activeDevice ? u.activeDevice.label : u.pendingDevices ? 'Phone waiting' : 'No phone') : u.totpEnabled ? '2-step on' : ''}
            <span className="block">{u.lastSeenAt ? `seen ${fmtRelative(u.lastSeenAt)}` : 'never signed in'}</span>
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
        title="People"
        description="Everyone in every company. You create the accounts and hand out the logins."
        actions={
          <Button variant="brand" icon={Plus} onClick={() => setAdding(true)}>
            Add person
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input placeholder="Name, username or phone" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value))} className="w-auto" aria-label="Company">
          <option value={0}>All companies</option>
          {(companies.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={role} onChange={(e) => setRole(e.target.value as '' | Role)} className="w-auto" aria-label="Role">
          <option value="">All roles</option>
          <option value="worker">Workers</option>
          <option value="manager">Managers</option>
          <option value="developer">Owners</option>
        </Select>
        <label className="ml-1 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
          Show turned-off accounts
        </label>
      </div>
      <Card className="overflow-hidden">
        {people.isPending ? <PageLoader /> : people.isError ? <ErrorBox error={people.error} /> : <PeopleTable people={people.data} emptyText="Nobody found" />}
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
  const [form, setForm] = useState<{ fullName: string; username: string; phone: string; employeeCode: string; notes: string } | null>(null);
  const [creds, setCreds] = useState<CreatedCredentials | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = q.data?.user;
    if (u) setForm({ fullName: u.fullName, username: u.username, phone: u.phone, employeeCode: u.employeeCode, notes: u.notes });
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

  const save = async () => {
    setSaving(true);
    try {
      await patch(`/api/dev/users/${user.id}`, form);
      toast.success('Saved');
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
          <ButtonLink to="/dev/people" variant="ghost" size="sm" icon={ArrowLeft} className="-ml-2 mb-2">
            People
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
            <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
            {user.companyName && <span>{user.companyName}</span>}
            {!user.active && <Badge tone="gray">Turned off</Badge>}
            {user.locked && <Badge tone="red">Locked after wrong passwords</Badge>}
          </span>
        }
        actions={
          user.role === 'worker' && user.companyId ? (
            <ButtonLink to={`/c/${user.companyId}/team/${user.id}`}>Open in company dashboard</ButtonLink>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title="Profile" />
          <div className="space-y-4 border-t border-line p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </Field>
              <Field label="Username">
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
              </Field>
              <Field label="Phone number">
                <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Employee number" optional>
                <Input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" optional>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end">
              <Button variant="brand" loading={saving} onClick={() => void save()}>
                Save changes
              </Button>
            </div>
            <p className="text-xs text-muted">
              Created {fmtDateTime(user.createdAt, 'UTC')} UTC · last sign-in {user.lastLoginAt ? fmtRelative(user.lastLoginAt) : 'never'}
            </p>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Access" />
            <div className="grid gap-2 border-t border-line p-5">
              <Button
                icon={KeyRound}
                className="justify-start"
                onClick={async () => {
                  if (await confirm({ title: `Reset ${user.fullName}'s password?`, body: 'A new password is created and all their sessions end.', confirmText: 'Reset password' })) {
                    try {
                      setCreds(await post<CreatedCredentials>(`/api/dev/users/${user.id}/reset-password`, { mustChangePassword: user.role !== 'worker' }));
                      await refresh();
                    } catch (err) {
                      toast.error(err);
                    }
                  }
                }}
              >
                Reset password
              </Button>
              {user.locked && (
                <Button icon={Unlock} className="justify-start" onClick={() => void act(() => post(`/api/dev/users/${user.id}/unlock`), 'Unlocked')}>
                  Unlock account
                </Button>
              )}
              <Button icon={LogOut} className="justify-start" onClick={() => void act(() => post(`/api/dev/users/${user.id}/logout-everywhere`), 'Signed out everywhere')}>
                Sign out everywhere
              </Button>
              {user.totpEnabled && (
                <Button icon={ShieldOff} className="justify-start" onClick={() => void act(() => post(`/api/dev/users/${user.id}/reset-2fa`), 'Two-step sign-in turned off')}>
                  Turn off two-step sign-in
                </Button>
              )}
              <Button
                icon={user.active ? UserRoundX : UserRoundCheck}
                className="justify-start"
                variant={user.active ? 'dangerSoft' : 'secondary'}
                onClick={() => void act(() => patch(`/api/dev/users/${user.id}`, { active: !user.active }), user.active ? 'Account turned off' : 'Account turned on')}
              >
                {user.active ? 'Turn account off' : 'Turn account on'}
              </Button>
              <Button
                icon={Trash2}
                variant="dangerSoft"
                className="justify-start"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete ${user.fullName}?`,
                    body: 'This also deletes all their check-ins, shifts and photos. To keep history, turn the account off instead.',
                    confirmText: 'Delete forever',
                    variant: 'danger',
                    typeToConfirm: user.username,
                  });
                  if (!ok) return;
                  try {
                    await del(`/api/dev/users/${user.id}`, { confirmUsername: user.username });
                    toast.success('Deleted');
                    await refresh();
                    navigate('/dev/people');
                  } catch (err) {
                    toast.error(err);
                  }
                }}
              >
                Delete account
              </Button>
            </div>
          </Card>

          {user.role === 'worker' && (
            <Card>
              <CardHeader title="Phones" description="One approved phone per worker." />
              <div className="divide-y divide-line border-t border-line">
                {devices.length === 0 && <p className="px-5 py-4 text-sm text-muted">No phone registered yet.</p>}
                {devices.map((d) => (
                  <div key={d.id} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Smartphone className="size-5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.label}</p>
                        <p className="truncate text-xs text-muted" title={d.userAgent}>
                          {fmtDateTime(d.createdAt, 'UTC')} UTC{d.lastUsedAt ? ` · used ${fmtRelative(d.lastUsedAt)}` : ''}
                          {d.decidedByName ? ` · by ${d.decidedByName}` : ''}
                        </p>
                      </div>
                      {deviceBadge(d.status)}
                    </div>
                    {(d.status === 'active' || d.status === 'pending') && (
                      <div className="mt-2 ml-8 flex gap-2">
                        {d.status === 'pending' && (
                          <Button size="xs" variant="success" onClick={() => void act(() => post(`/api/dev/devices/${d.id}/approve`), 'Approved')}>
                            Approve
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="dangerSoft"
                          onClick={() => void act(() => post(`/api/dev/devices/${d.id}/${d.status === 'pending' ? 'reject' : 'revoke'}`), 'Done')}
                        >
                          {d.status === 'pending' ? 'Reject' : 'Remove'}
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
