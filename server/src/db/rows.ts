// Raw row shapes as stored in SQLite (snake_case, integers for booleans).

import type { Role } from '../../../shared/types';

export interface CompanyRow {
  id: number;
  name: string;
  timezone: string;
  settings: string;
  notes: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface SiteRow {
  id: number;
  company_id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  networks: string;
  require_network: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: number;
  company_id: number | null;
  role: Role;
  username: string;
  password_hash: string;
  full_name: string;
  phone: string;
  employee_code: string;
  notes: string;
  active: number;
  must_change_password: number;
  failed_logins: number;
  locked_until: string | null;
  totp_secret: string | null;
  totp_enabled: number;
  totp_last_step: number | null;
  password_changed_at: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: number;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string;
  user_agent: string;
  mfa_pending: number;
  revoked_at: string | null;
}

export interface DeviceRow {
  id: number;
  user_id: number;
  company_id: number;
  key_id: string;
  public_key: string;
  status: 'pending' | 'active' | 'revoked' | 'rejected';
  label: string;
  user_agent: string;
  fingerprint: string;
  fingerprint_hash: string;
  similar_user_id: number | null;
  request_note: string;
  ip: string;
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
  last_used_at: string | null;
}

export interface ChallengeRow {
  nonce: string;
  user_id: number;
  device_id: number | null;
  purpose: string;
  require_selfie: number;
  ref_id: number | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export interface ShiftRow {
  id: number;
  company_id: number;
  site_id: number;
  worker_id: number;
  starts_at: string;
  ends_at: string;
  note: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PunchRow {
  id: number;
  company_id: number;
  worker_id: number;
  device_id: number | null;
  type: 'in' | 'out';
  result: 'accepted' | 'review' | 'rejected';
  reason: string | null;
  at: string;
  site_id: number | null;
  shift_id: number | null;
  entry_id: number | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  distance_m: number | null;
  samples: string;
  client: string;
  ip: string;
  network_match: number;
  selfie_id: string | null;
  risk_score: number;
  flags: string;
  note: string;
  review_status: 'pending' | 'approved' | 'rejected' | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string;
  created_at: string;
}

export interface EntryRow {
  id: number;
  company_id: number;
  worker_id: number;
  site_id: number | null;
  shift_id: number | null;
  in_punch_id: number | null;
  out_punch_id: number | null;
  clock_in_at: string;
  clock_out_at: string | null;
  status: 'open' | 'closed' | 'incomplete' | 'void';
  source: 'app' | 'manual';
  note: string;
  edited_by: number | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PresenceRow {
  id: number;
  company_id: number;
  worker_id: number;
  entry_id: number | null;
  requested_by: number | null;
  requested_at: string;
  expires_at: string;
  status: 'pending' | 'passed' | 'failed' | 'expired' | 'cancelled';
  responded_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  distance_m: number | null;
  site_id: number | null;
  selfie_id: string | null;
  flags: string;
  risk_score: number;
  reason: string | null;
  ip: string;
}

export interface SecurityEventRow {
  id: number;
  at: string;
  company_id: number | null;
  user_id: number | null;
  kind: string;
  severity: 'info' | 'warn' | 'high';
  message: string;
  details: string;
  ip: string;
  resolved_by: number | null;
  resolved_at: string | null;
}
