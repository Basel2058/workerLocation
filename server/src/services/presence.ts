import type { PresenceCheck, PresenceOutcome, PunchChallenge, SignedEnvelope } from '../../../shared/types';
import type { DB } from '../db';
import type { CompanyRow, PresenceRow } from '../db/rows';
import { sha256Hex } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { consumeChallenge, createChallenge, decideSelfie } from './challenges';
import { companySettings, listSites } from './companies';
import { requireUsableDevice } from './devices';
import { openEntry } from './entries';
import { audit, securityEvent, type Actor } from './logs';
import { decodeSelfie, riskHistory, storeSelfie, toRiskSite, verifySignedPayload, type PunchContext } from './punch';
import type { PushService } from './push';
import { evaluateRisk } from './risk';
import { getCompanyWorker } from './users';

export const PRESENCE_TTL_MIN = 15;

interface PresenceListRow extends PresenceRow {
  site_name: string | null;
  requested_by_name: string | null;
}

const PRESENCE_SELECT = `
  SELECT pc.*, s.name AS site_name, r.full_name AS requested_by_name
  FROM presence_checks pc
  LEFT JOIN sites s ON s.id = pc.site_id
  LEFT JOIN users r ON r.id = pc.requested_by`;

export function toPresence(row: PresenceListRow): PresenceCheck {
  return {
    id: row.id,
    workerId: row.worker_id,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    status: row.status,
    respondedAt: row.responded_at,
    distanceM: row.distance_m === null ? null : Math.round(row.distance_m),
    siteName: row.site_name,
    requestedByName: row.requested_by_name,
  };
}

export interface PresenceWithPosition {
  check: PresenceCheck;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}

/** Latest presence check per worker since a point in time, with the position the worker reported. */
export function latestPresenceByWorker(db: DB, companyId: number, since: string): Map<number, PresenceWithPosition> {
  const rows = db
    .prepare(`${PRESENCE_SELECT} WHERE pc.company_id = ? AND pc.requested_at >= ? ORDER BY pc.requested_at`)
    .all(companyId, since) as PresenceListRow[];
  const map = new Map<number, PresenceWithPosition>();
  for (const row of rows) {
    map.set(row.worker_id, { check: toPresence(row), lat: row.lat, lng: row.lng, accuracy: row.accuracy });
  }
  return map;
}

export function pendingPresence(db: DB, workerId: number): PresenceCheck | null {
  const row = db
    .prepare(`${PRESENCE_SELECT} WHERE pc.worker_id = ? AND pc.status = 'pending' AND pc.expires_at > ? ORDER BY pc.id DESC LIMIT 1`)
    .get(workerId, nowIso()) as PresenceListRow | undefined;
  return row ? toPresence(row) : null;
}

/** A manager asks a checked-in worker to prove, right now, that they are still at the workplace. */
export function requestPresence(db: DB, push: PushService, actor: Actor, company: CompanyRow, workerId: number): PresenceCheck {
  const worker = getCompanyWorker(db, company.id, workerId);
  const entry = openEntry(db, worker.id);
  if (!entry) throw conflict(`${worker.full_name} is not checked in right now.`, 'NOT_IN');
  const existing = pendingPresence(db, worker.id);
  if (existing) return existing;
  const now = nowIso();
  const id = Number(
    db
      .prepare(
        `INSERT INTO presence_checks (company_id, worker_id, entry_id, requested_by, requested_at, expires_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(company.id, worker.id, entry.id, actor.id, now, new Date(Date.now() + PRESENCE_TTL_MIN * 60_000).toISOString())
      .lastInsertRowid,
  );
  audit(db, actor, 'presence.request', {
    companyId: company.id,
    entity: 'presence_check',
    entityId: id,
    summary: `Asked ${worker.full_name} to confirm they are at work`,
  });
  push.notifyUser(worker.id, {
    title: 'Are you at work?',
    body: `Please confirm your location within ${PRESENCE_TTL_MIN} minutes.`,
    url: '/',
    tag: 'presence',
  });
  return toPresence(db.prepare(`${PRESENCE_SELECT} WHERE pc.id = ?`).get(id) as PresenceListRow);
}

export function presenceChallenge(ctx: PunchContext, checkId: number, keyId: string): PunchChallenge {
  const { db, user, company } = ctx;
  const device = requireUsableDevice(db, user.id, keyId);
  const check = db.prepare('SELECT * FROM presence_checks WHERE id = ? AND worker_id = ?').get(checkId, user.id) as
    | PresenceRow
    | undefined;
  if (!check) throw notFound('Presence check not found.');
  if (check.status !== 'pending' || check.expires_at <= nowIso()) {
    throw conflict('This check is no longer open.', 'PRESENCE_CLOSED');
  }
  const s = companySettings(company);
  const requireSelfie = decideSelfie(db, user.id, s.selfieMode, s.selfieRandomPercent);
  const challenge = createChallenge(db, {
    userId: user.id,
    deviceId: device.id,
    purpose: `presence:${checkId}`,
    requireSelfie,
    refId: checkId,
  });
  return { nonce: challenge.nonce, expiresAt: challenge.expires_at, requireSelfie };
}

export function submitPresence(ctx: PunchContext, push: PushService, envelope: SignedEnvelope): PresenceOutcome {
  const { db, user, company } = ctx;
  const device = requireUsableDevice(db, user.id, envelope.keyId);
  const payload = verifySignedPayload(ctx, device, envelope);
  if (payload.type !== 'check' || !payload.checkId) throw badRequest('Invalid request.');
  const challenge = consumeChallenge(db, {
    nonce: payload.nonce,
    userId: user.id,
    deviceId: device.id,
    purpose: `presence:${payload.checkId}`,
  });
  const check = db.prepare('SELECT * FROM presence_checks WHERE id = ? AND worker_id = ?').get(payload.checkId, user.id) as
    | PresenceRow
    | undefined;
  if (!check) throw notFound('Presence check not found.');
  const now = nowIso();
  if (check.status !== 'pending' || check.expires_at <= now) {
    throw conflict('This check is no longer open.', 'PRESENCE_CLOSED');
  }
  if (challenge.require_selfie && !payload.selfie) throw badRequest('A photo is needed.', 'SELFIE_REQUIRED');
  const selfie = payload.selfie ? decodeSelfie(payload.selfie) : null;
  const selfieHash = selfie ? sha256Hex(selfie) : null;
  const selfieDuplicate = !!selfieHash && !!db.prepare('SELECT 1 FROM selfies WHERE sha256 = ? LIMIT 1').get(selfieHash);

  const entry = check.entry_id
    ? (db.prepare('SELECT site_id FROM time_entries WHERE id = ?').get(check.entry_id) as { site_id: number | null } | undefined)
    : undefined;
  const risk = evaluateRisk({
    kind: 'check',
    nowMs: Date.parse(now),
    samples: payload.samples,
    clientTime: payload.clientTime,
    env: payload.env,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    settings: companySettings(company),
    sites: listSites(db, company.id, true).map(toRiskSite),
    targetSiteId: entry?.site_id ?? null,
    ...riskHistory(db, company, user.id, now),
    deviceApprovedAtMs: device.decided_at ? Date.parse(device.decided_at) : null,
    selfieDuplicate,
    request: false,
    unscheduled: false,
  });
  const status = risk.result === 'rejected' ? 'failed' : 'passed';

  db.transaction(() => {
    const selfieId = selfie && selfieHash ? storeSelfie(db, company.id, user.id, selfie, selfieHash) : null;
    db.prepare(
      `UPDATE presence_checks SET status = ?, responded_at = ?, lat = ?, lng = ?, accuracy = ?, distance_m = ?, site_id = ?,
         selfie_id = ?, flags = ?, risk_score = ?, reason = ?, ip = ? WHERE id = ?`,
    ).run(
      status,
      now,
      risk.best?.lat ?? null,
      risk.best?.lng ?? null,
      risk.best?.acc ?? null,
      risk.distanceM,
      risk.site?.id ?? null,
      selfieId,
      JSON.stringify(risk.flags),
      risk.score,
      risk.reason,
      ctx.ip,
      check.id,
    );
    db.prepare('UPDATE devices SET last_used_at = ? WHERE id = ?').run(now, device.id);
    if (status === 'failed') {
      securityEvent(db, {
        companyId: company.id,
        userId: user.id,
        kind: 'presence_failed',
        severity: 'warn',
        message: `${user.full_name} failed a presence check${risk.distanceM !== null && risk.site ? ` (${risk.distanceM} m from ${risk.site.name})` : ''}.`,
        details: { checkId: check.id, reason: risk.reason, flags: risk.flags },
        ip: ctx.ip,
      });
    }
  })();
  if (status === 'failed') {
    push.notifyManagers(company.id, {
      title: 'Presence check failed',
      body: `${user.full_name} is not at the workplace.`,
      url: '/m',
      tag: `presence-${check.id}`,
    });
  }
  return {
    status,
    siteName: risk.site?.name ?? null,
    distanceM: risk.distanceM,
    message:
      status === 'passed'
        ? 'Thanks! Your manager can see you are at work.'
        : risk.reason === 'OUTSIDE_GEOFENCE'
          ? `You are ${risk.distanceM ?? '?'} m from ${risk.site?.name ?? 'your workplace'}. Your manager has been told.`
          : 'Your location could not be confirmed. Your manager has been told.',
  };
}

/** Job: marks unanswered presence checks as expired and tells the managers. */
export function expirePresenceChecks(db: DB, push: PushService, now = nowIso()): number {
  const rows = db
    .prepare(
      `SELECT pc.*, u.full_name FROM presence_checks pc JOIN users u ON u.id = pc.worker_id
       WHERE pc.status = 'pending' AND pc.expires_at <= ?`,
    )
    .all(now) as Array<PresenceRow & { full_name: string }>;
  for (const row of rows) {
    db.prepare("UPDATE presence_checks SET status = 'expired' WHERE id = ? AND status = 'pending'").run(row.id);
    securityEvent(db, {
      companyId: row.company_id,
      userId: row.worker_id,
      kind: 'presence_expired',
      severity: 'warn',
      message: `${row.full_name} did not answer a presence check within ${PRESENCE_TTL_MIN} minutes.`,
      details: { checkId: row.id },
    });
    push.notifyManagers(row.company_id, {
      title: 'No answer to presence check',
      body: `${row.full_name} did not confirm being at work.`,
      url: '/m',
      tag: `presence-${row.id}`,
    });
  }
  return rows.length;
}
