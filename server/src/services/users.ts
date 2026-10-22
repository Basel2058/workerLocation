import type { SessionUser, UserRecord } from '../../../shared/types';
import type { DB } from '../db';
import type { CompanyRow, UserRow } from '../db/rows';
import { notFound } from '../lib/errors';
import { nowIso } from '../lib/time';

export function isLocked(user: Pick<UserRow, 'locked_until'>): boolean {
  return !!user.locked_until && user.locked_until > nowIso();
}

export function toSessionUser(user: UserRow, company: CompanyRow | null): SessionUser {
  return {
    id: user.id,
    role: user.role,
    username: user.username,
    fullName: user.full_name,
    phone: user.phone,
    companyId: user.company_id,
    companyName: company?.name ?? null,
    timezone: company?.timezone ?? 'UTC',
    mustChangePassword: !!user.must_change_password,
    totpEnabled: !!user.totp_enabled,
  };
}

interface UserListRow extends UserRow {
  company_name: string | null;
  device_id: number | null;
  device_label: string | null;
  device_last_used_at: string | null;
  pending_devices: number;
}

const USER_LIST_SQL = `
  SELECT u.*, c.name AS company_name,
    d.id AS device_id, d.label AS device_label, d.last_used_at AS device_last_used_at,
    (SELECT count(*) FROM devices p WHERE p.user_id = u.id AND p.status = 'pending') AS pending_devices
  FROM users u
  LEFT JOIN companies c ON c.id = u.company_id
  LEFT JOIN devices d ON d.user_id = u.id AND d.status = 'active'`;

function toUserRecord(row: UserListRow): UserRecord {
  return {
    id: row.id,
    role: row.role,
    companyId: row.company_id,
    companyName: row.company_name,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    employeeCode: row.employee_code,
    notes: row.notes,
    active: !!row.active,
    mustChangePassword: !!row.must_change_password,
    locked: isLocked(row),
    totpEnabled: !!row.totp_enabled,
    lastLoginAt: row.last_login_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    activeDevice: row.device_id
      ? { id: row.device_id, label: row.device_label ?? '', lastUsedAt: row.device_last_used_at }
      : null,
    pendingDevices: row.pending_devices,
  };
}

export function getUserRecord(db: DB, id: number): UserRecord {
  const row = db.prepare(`${USER_LIST_SQL} WHERE u.id = ?`).get(id) as UserListRow | undefined;
  if (!row) throw notFound('User not found.');
  return toUserRecord(row);
}

export function listUserRecords(
  db: DB,
  filter: { companyId?: number; role?: string; q?: string; includeInactive?: boolean },
): UserRecord[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.companyId) {
    where.push('u.company_id = ?');
    args.push(filter.companyId);
  }
  if (filter.role) {
    where.push('u.role = ?');
    args.push(filter.role);
  }
  if (filter.q) {
    where.push("(u.full_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\' OR u.employee_code LIKE ? ESCAPE '\\')");
    const like = `%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like, like);
  }
  if (!filter.includeInactive) where.push('u.active = 1');
  const sql = `${USER_LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE u.role WHEN 'developer' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.full_name COLLATE NOCASE
    LIMIT 2000`;
  return (db.prepare(sql).all(...args) as UserListRow[]).map(toUserRecord);
}

export function getUser(db: DB, id: number): UserRow {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) throw notFound('User not found.');
  return row;
}

/** Loads a worker that belongs to the given company (404 otherwise, so ids from other companies leak nothing). */
export function getCompanyWorker(db: DB, companyId: number, workerId: number): UserRow {
  const row = db
    .prepare("SELECT * FROM users WHERE id = ? AND company_id = ? AND role = 'worker'")
    .get(workerId, companyId) as UserRow | undefined;
  if (!row) throw notFound('Worker not found.');
  return row;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
