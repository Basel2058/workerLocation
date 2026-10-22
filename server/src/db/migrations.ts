// Schema migrations. Append new migrations to the end; never edit one that has shipped.

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sites (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_m INTEGER NOT NULL,
  networks TEXT NOT NULL DEFAULT '[]',
  require_network INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sites_company ON sites(company_id);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('developer', 'manager', 'worker')),
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  employee_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER,
  password_changed_at TEXT,
  last_login_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((role = 'developer' AND company_id IS NULL) OR (role <> 'developer' AND company_id IS NOT NULL))
);
CREATE INDEX users_company ON users(company_id, role);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  mfa_pending INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked', 'rejected')),
  label TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL DEFAULT '{}',
  fingerprint_hash TEXT NOT NULL DEFAULT '',
  similar_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  request_note TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_used_at TEXT
);
CREATE INDEX devices_user ON devices(user_id, status);
CREATE INDEX devices_company ON devices(company_id, status);
CREATE INDEX devices_fingerprint ON devices(fingerprint_hash);

CREATE TABLE challenges (
  nonce TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  require_selfie INTEGER NOT NULL DEFAULT 0,
  ref_id INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX challenges_user ON challenges(user_id, created_at);

CREATE TABLE shifts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX shifts_worker ON shifts(worker_id, starts_at);
CREATE INDEX shifts_company ON shifts(company_id, starts_at);

CREATE TABLE selfies (
  id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX selfies_user ON selfies(user_id, created_at);
CREATE INDEX selfies_hash ON selfies(sha256);
CREATE INDEX selfies_created ON selfies(created_at);

CREATE TABLE punches (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  result TEXT NOT NULL CHECK (result IN ('accepted', 'review', 'rejected')),
  reason TEXT,
  at TEXT NOT NULL,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  entry_id INTEGER,
  lat REAL,
  lng REAL,
  accuracy REAL,
  distance_m REAL,
  samples TEXT NOT NULL DEFAULT '[]',
  client TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  network_match INTEGER NOT NULL DEFAULT 0,
  selfie_id TEXT REFERENCES selfies(id) ON DELETE SET NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  flags TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  review_status TEXT CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX punches_worker ON punches(worker_id, at);
CREATE INDEX punches_company ON punches(company_id, at);
CREATE INDEX punches_review ON punches(company_id, review_status);
CREATE INDEX punches_at ON punches(at);

CREATE TABLE time_entries (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  in_punch_id INTEGER REFERENCES punches(id) ON DELETE SET NULL,
  out_punch_id INTEGER REFERENCES punches(id) ON DELETE SET NULL,
  clock_in_at TEXT NOT NULL,
  clock_out_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'incomplete', 'void')),
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'manual')),
  note TEXT NOT NULL DEFAULT '',
  edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  edited_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at)
);
CREATE INDEX entries_worker ON time_entries(worker_id, clock_in_at);
CREATE INDEX entries_company ON time_entries(company_id, clock_in_at);
CREATE INDEX entries_shift ON time_entries(shift_id);
CREATE INDEX entries_status ON time_entries(status);
CREATE UNIQUE INDEX entries_one_open ON time_entries(worker_id) WHERE status = 'open';

CREATE TABLE presence_checks (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id INTEGER REFERENCES time_entries(id) ON DELETE SET NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'expired', 'cancelled')),
  responded_at TEXT,
  lat REAL,
  lng REAL,
  accuracy REAL,
  distance_m REAL,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  selfie_id TEXT REFERENCES selfies(id) ON DELETE SET NULL,
  flags TEXT NOT NULL DEFAULT '[]',
  risk_score INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX presence_worker ON presence_checks(worker_id, requested_at);
CREATE INDEX presence_company ON presence_checks(company_id, requested_at);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  failures INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_user ON push_subscriptions(user_id);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  company_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX audit_company ON audit_log(company_id, id);

CREATE TABLE security_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  company_id INTEGER,
  user_id INTEGER,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'high')),
  message TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  resolved_by INTEGER,
  resolved_at TEXT
);
CREATE INDEX security_company ON security_events(company_id, id);
CREATE INDEX security_at ON security_events(at);

CREATE TABLE system_logs (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT
);
CREATE INDEX system_logs_at ON system_logs(at);

CREATE TABLE job_runs (
  name TEXT PRIMARY KEY,
  last_started_at TEXT,
  last_finished_at TEXT,
  last_status TEXT,
  last_message TEXT NOT NULL DEFAULT '',
  last_duration_ms INTEGER,
  run_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
];
