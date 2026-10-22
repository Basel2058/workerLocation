import type { DB } from '../db';
import type { ChallengeRow } from '../db/rows';
import { randomToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { nowIso } from '../lib/time';
import { securityEvent } from './logs';

const CHALLENGE_TTL_MS = 3 * 60_000;

/** Single-use, short-lived nonce that a device must sign. Stops replaying a captured check-in. */
export function createChallenge(
  db: DB,
  opts: { userId: number; deviceId: number | null; purpose: string; requireSelfie?: boolean; refId?: number | null },
): ChallengeRow {
  const row: ChallengeRow = {
    nonce: randomToken(24),
    user_id: opts.userId,
    device_id: opts.deviceId,
    purpose: opts.purpose,
    require_selfie: opts.requireSelfie ? 1 : 0,
    ref_id: opts.refId ?? null,
    created_at: nowIso(),
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    used_at: null,
  };
  db.prepare(
    `INSERT INTO challenges (nonce, user_id, device_id, purpose, require_selfie, ref_id, created_at, expires_at)
     VALUES (@nonce, @user_id, @device_id, @purpose, @require_selfie, @ref_id, @created_at, @expires_at)`,
  ).run(row);
  return row;
}

export function consumeChallenge(
  db: DB,
  opts: { nonce: string; userId: number; deviceId: number | null; purpose: string },
): ChallengeRow {
  const row = db.prepare('SELECT * FROM challenges WHERE nonce = ?').get(opts.nonce) as ChallengeRow | undefined;
  const invalid = () => new AppError(400, 'CHALLENGE_INVALID', 'This request expired. Please try again.');
  if (!row || row.user_id !== opts.userId || row.purpose !== opts.purpose) throw invalid();
  if (opts.deviceId !== null && row.device_id !== opts.deviceId) throw invalid();
  if (row.used_at) {
    const user = db.prepare('SELECT company_id FROM users WHERE id = ?').get(opts.userId) as
      | { company_id: number | null }
      | undefined;
    securityEvent(db, {
      companyId: user?.company_id ?? null,
      userId: opts.userId,
      kind: 'replay',
      severity: 'warn',
      message: 'A signed request was sent twice (possible replay).',
      details: { purpose: row.purpose },
    });
    throw invalid();
  }
  if (row.expires_at <= nowIso()) throw invalid();
  const res = db.prepare('UPDATE challenges SET used_at = ? WHERE nonce = ? AND used_at IS NULL').run(nowIso(), row.nonce);
  if (res.changes !== 1) throw invalid();
  return row;
}

/**
 * Whether the next punch must include a selfie. In "random" mode a worker who backs out of a punch that
 * asked for a selfie keeps getting asked for 30 minutes, so retrying does not dodge the photo.
 */
export function decideSelfie(db: DB, userId: number, mode: 'always' | 'random' | 'off', percent: number): boolean {
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const pending = db
    .prepare(
      `SELECT 1 FROM challenges WHERE user_id = ? AND require_selfie = 1 AND used_at IS NULL AND created_at > ?
       AND purpose LIKE 'punch:%' LIMIT 1`,
    )
    .get(userId, since);
  if (pending) return true;
  return Math.random() * 100 < percent;
}
