import type { Role } from '../../../shared/types';
import type { DB } from '../db';
import type { SessionRow, UserRow } from '../db/rows';
import { randomToken, sha256Hex } from '../lib/crypto';
import { nowIso } from '../lib/time';

export const SESSION_COOKIE = 'onsite_sid';

/** Sliding session lifetime per role. Workers stay signed in so checking in is one tap. */
const TTL_DAYS: Record<Role, number> = { worker: 180, manager: 30, developer: 3 };
/** A session waiting for a two-factor code expires quickly. */
const MFA_PENDING_TTL_MS = 10 * 60_000;
const TOUCH_INTERVAL_MS = 10 * 60_000;

export const sessionTtlMs = (role: Role) => TTL_DAYS[role] * 86_400_000;

export function createSession(
  db: DB,
  user: Pick<UserRow, 'id' | 'role'>,
  ip: string,
  userAgent: string,
  mfaPending = false,
): { token: string; expiresAt: string } {
  const token = randomToken(32);
  const now = Date.now();
  const expiresAt = new Date(now + (mfaPending ? MFA_PENDING_TTL_MS : sessionTtlMs(user.role))).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, ip, user_agent, mfa_pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sha256Hex(token), user.id, nowIso(), nowIso(), expiresAt, ip, userAgent.slice(0, 400), mfaPending ? 1 : 0);
  return { token, expiresAt };
}

export interface LoadedSession {
  session: SessionRow;
  user: UserRow;
}

export function loadSession(db: DB, token: string): LoadedSession | null {
  if (!token || token.length > 100) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sha256Hex(token)) as SessionRow | undefined;
  if (!session || session.revoked_at || session.expires_at <= nowIso()) return null;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow | undefined;
  if (!user || !user.active) return null;
  return { session, user };
}

/** Extends a session's sliding expiry, at most every few minutes to limit writes. */
export function touchSession(db: DB, session: SessionRow, user: UserRow, ip: string): void {
  if (session.mfa_pending) return;
  const now = Date.now();
  if (now - Date.parse(session.last_seen_at) < TOUCH_INTERVAL_MS) return;
  const iso = new Date(now).toISOString();
  db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ?, ip = ? WHERE id = ?').run(
    iso,
    new Date(now + sessionTtlMs(user.role)).toISOString(),
    ip,
    session.id,
  );
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(iso, user.id);
}

export function completeMfa(db: DB, session: SessionRow, user: UserRow): void {
  db.prepare('UPDATE sessions SET mfa_pending = 0, expires_at = ?, last_seen_at = ? WHERE id = ?').run(
    new Date(Date.now() + sessionTtlMs(user.role)).toISOString(),
    nowIso(),
    session.id,
  );
}

export function revokeSession(db: DB, sessionId: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(nowIso(), sessionId);
}

export function revokeUserSessions(db: DB, userId: number, exceptSessionId?: string): number {
  return db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id IS NOT ?')
    .run(nowIso(), userId, exceptSessionId ?? null).changes;
}
