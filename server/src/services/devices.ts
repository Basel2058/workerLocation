import { z } from 'zod';
import type {
  Device,
  DeviceFingerprint,
  DeviceKeyState,
  DeviceRegistrationResult,
  SignedEnvelope,
} from '../../../shared/types';
import type { DB } from '../db';
import type { CompanyRow, DeviceRow, UserRow } from '../db/rows';
import { isEcPublicJwk, jwkThumbprint, sha256Hex, verifyDeviceSignature, type EcPublicJwk } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { consumeChallenge } from './challenges';
import { companySettings } from './companies';
import { audit, securityEvent, type Actor } from './logs';

const fingerprintSchema = z.object({
  ua: z.string().max(500),
  platform: z.string().max(100),
  model: z.string().max(100),
  languages: z.string().max(200),
  tz: z.string().max(100),
  screen: z.string().max(50),
  dpr: z.number().min(0).max(20),
  cores: z.number().int().min(0).max(1024),
  memory: z.number().min(0).max(1024).nullable(),
  touch: z.number().int().min(0).max(100),
  gpu: z.string().max(300),
});

const registrationSchema = z.object({
  v: z.literal(1),
  nonce: z.string().min(16).max(100),
  publicKey: z.unknown(),
  fingerprint: fingerprintSchema,
  note: z.string().max(300).default(''),
});

/** The fields that stay the same for one phone + browser; equal hashes mean "looks like the same phone". */
function fingerprintHash(fp: DeviceFingerprint): string {
  return sha256Hex(
    JSON.stringify([fp.ua, fp.platform, fp.model, fp.screen, fp.dpr, fp.cores, fp.memory, fp.gpu, fp.languages, fp.tz]),
  );
}

/** Human label like "iPhone · Safari" or "SM-A525F · Chrome". */
export function deviceLabel(ua: string, model = ''): string {
  let device = 'Unknown device';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) {
    const m = /Android [\d.]+; ([^;)]+)\)/.exec(ua);
    const uaModel = m?.[1]?.trim();
    device = model.trim() || (uaModel && uaModel !== 'K' ? uaModel : 'Android phone');
  } else if (/Windows/.test(ua)) device = 'Windows computer';
  else if (/Macintosh/.test(ua)) device = 'Mac';
  else if (/CrOS/.test(ua)) device = 'Chromebook';
  else if (/Linux/.test(ua)) device = 'Linux computer';

  let browser = '';
  if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/EdgA?\/|EdgiOS/.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return browser ? `${device} · ${browser}` : device;
}

interface DeviceListRow extends DeviceRow {
  decided_by_name: string | null;
  similar_name: string | null;
}

export function toDevice(row: DeviceListRow): Device {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    status: row.status,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedByName: row.decided_by_name,
    lastUsedAt: row.last_used_at,
    requestNote: row.request_note,
    similarTo: row.similar_user_id ? { id: row.similar_user_id, name: row.similar_name ?? 'Another worker' } : null,
  };
}

export const DEVICE_LIST_SQL = `
  SELECT d.*, dec.full_name AS decided_by_name, sim.full_name AS similar_name
  FROM devices d
  LEFT JOIN users dec ON dec.id = d.decided_by
  LEFT JOIN users sim ON sim.id = d.similar_user_id`;

export function listUserDevices(db: DB, userId: number): Device[] {
  return (db.prepare(`${DEVICE_LIST_SQL} WHERE d.user_id = ? ORDER BY d.id DESC`).all(userId) as DeviceListRow[]).map(
    toDevice,
  );
}

export function activeDevice(db: DB, userId: number): DeviceRow | null {
  return (
    (db.prepare("SELECT * FROM devices WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(userId) as
      | DeviceRow
      | undefined) ?? null
  );
}

/** What this browser's key means for the signed-in worker. */
export function deviceKeyState(db: DB, userId: number, keyId: string): DeviceKeyState {
  const row = db.prepare('SELECT user_id, status FROM devices WHERE key_id = ?').get(keyId) as
    | Pick<DeviceRow, 'user_id' | 'status'>
    | undefined;
  if (!row) return 'unknown';
  if (row.user_id !== userId) return 'other_user';
  return row.status;
}

export interface RegisterContext {
  db: DB;
  user: UserRow;
  company: CompanyRow;
  ip: string;
  userAgent: string;
  /** Key id remembered in this browser's long-lived cookie, if any. */
  rememberedKeyId: string | null;
}

/**
 * Binds a browser-generated key to a worker. The private key never leaves the phone (non-extractable
 * WebCrypto key), so a password alone is useless on another phone. Rules:
 *  - one key belongs to exactly one worker: a phone already linked to someone else is refused;
 *  - a worker's very first phone can be approved automatically;
 *  - every later phone waits for a manager, and approving it retires the old one.
 */
export function registerDevice(ctx: RegisterContext, envelope: SignedEnvelope): DeviceRegistrationResult {
  const { db, user, company } = ctx;
  let parsed: z.infer<typeof registrationSchema>;
  try {
    parsed = registrationSchema.parse(JSON.parse(envelope.payload));
  } catch {
    throw badRequest('Invalid device registration.');
  }
  if (!isEcPublicJwk(parsed.publicKey)) throw badRequest('Invalid device key.');
  const jwk: EcPublicJwk = parsed.publicKey;
  const keyId = jwkThumbprint(jwk);
  if (keyId !== envelope.keyId || !verifyDeviceSignature(jwk, envelope.payload, envelope.signature)) {
    throw badRequest('Device signature is not valid.', 'BAD_SIGNATURE');
  }
  consumeChallenge(db, { nonce: parsed.nonce, userId: user.id, deviceId: null, purpose: 'device' });

  const byKey = db.prepare('SELECT * FROM devices WHERE key_id = ?');
  const existing = byKey.get(keyId) as DeviceRow | undefined;
  if (existing && existing.user_id === user.id) {
    return { deviceId: existing.id, status: existing.status, label: existing.label };
  }
  // A phone counts as someone else's while their registration is active or waiting for approval.
  const heldByOther = (d: DeviceRow | undefined) =>
    !!d && d.user_id !== user.id && (d.status === 'active' || d.status === 'pending');
  const remembered = ctx.rememberedKeyId ? (byKey.get(ctx.rememberedKeyId) as DeviceRow | undefined) : undefined;
  const otherOwnerId = heldByOther(existing) ? existing!.user_id : heldByOther(remembered) ? remembered!.user_id : null;
  if (existing && !otherOwnerId) {
    // The key was retired from another account; the browser must make a fresh one.
    throw conflict('Please try again.', 'KEY_RETIRED');
  }
  if (otherOwnerId) {
    const owner = db.prepare('SELECT id, full_name, company_id FROM users WHERE id = ?').get(otherOwnerId) as
      | Pick<UserRow, 'id' | 'full_name' | 'company_id'>
      | undefined;
    securityEvent(db, {
      companyId: company.id,
      userId: user.id,
      kind: 'device_conflict',
      severity: 'high',
      message: `${user.full_name}'s account was used on the phone of ${owner?.full_name ?? 'another worker'}.`,
      details: { ownerId: otherOwnerId, ownerName: owner?.full_name, userAgent: ctx.userAgent },
      ip: ctx.ip,
    });
    throw new AppError(
      409,
      'DEVICE_OF_OTHER_WORKER',
      'This phone is already registered to another worker. Every worker must use their own phone. Your manager has been notified.',
    );
  }

  const fingerprint = parsed.fingerprint;
  const fpHash = fingerprintHash(fingerprint);
  const similar = db
    .prepare(
      `SELECT d.user_id FROM devices d
       WHERE d.fingerprint_hash = ? AND d.user_id <> ? AND d.status IN ('active', 'pending') AND d.company_id = ?
       ORDER BY d.id DESC LIMIT 1`,
    )
    .get(fpHash, user.id, company.id) as { user_id: number } | undefined;

  const pendingCount = (
    db.prepare("SELECT count(*) AS n FROM devices WHERE user_id = ? AND status = 'pending'").get(user.id) as { n: number }
  ).n;
  if (pendingCount >= 3) {
    throw conflict('You already have phones waiting for approval. Ask your manager to approve or reject them.', 'TOO_MANY_PENDING');
  }

  const everHadDevice = !!db.prepare('SELECT 1 FROM devices WHERE user_id = ? LIMIT 1').get(user.id);
  const settings = companySettings(company);
  // Identical phones (same model, system version, browser and language) are common in one workplace, so a
  // look-alike is only shown to the manager as context; it never blocks or accuses anyone on its own.
  const autoApprove = !everHadDevice && settings.autoApproveFirstDevice;
  const now = nowIso();
  const label = deviceLabel(ctx.userAgent, fingerprint.model);
  const id = Number(
    db
      .prepare(
        `INSERT INTO devices (user_id, company_id, key_id, public_key, status, label, user_agent, fingerprint,
           fingerprint_hash, similar_user_id, request_note, ip, created_at, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        company.id,
        keyId,
        JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }),
        autoApprove ? 'active' : 'pending',
        label,
        ctx.userAgent.slice(0, 500),
        JSON.stringify(fingerprint),
        fpHash,
        similar?.user_id ?? null,
        parsed.note.trim(),
        ctx.ip,
        now,
        autoApprove ? now : null,
      ).lastInsertRowid,
  );

  return { deviceId: id, status: autoApprove ? 'active' : 'pending', label };
}

export function getCompanyDevice(db: DB, companyId: number, deviceId: number): DeviceRow {
  const row = db.prepare('SELECT * FROM devices WHERE id = ? AND company_id = ?').get(deviceId, companyId) as
    | DeviceRow
    | undefined;
  if (!row) throw notFound('Phone not found.');
  return row;
}

export function decideDevice(db: DB, actor: Actor, device: DeviceRow, decision: 'approve' | 'reject'): void {
  if (device.status !== 'pending') throw conflict('This request was already handled.', 'ALREADY_DECIDED');
  const now = nowIso();
  const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(device.user_id) as { full_name: string };
  db.transaction(() => {
    if (decision === 'approve') {
      // One phone per worker: the old phone stops working the moment the new one is approved.
      db.prepare(
        "UPDATE devices SET status = 'revoked', decided_at = ?, decided_by = ? WHERE user_id = ? AND status = 'active'",
      ).run(now, actor.id, device.user_id);
    }
    db.prepare('UPDATE devices SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?').run(
      decision === 'approve' ? 'active' : 'rejected',
      now,
      actor.id,
      device.id,
    );
    audit(db, actor, decision === 'approve' ? 'device.approve' : 'device.reject', {
      companyId: device.company_id,
      entity: 'device',
      entityId: device.id,
      summary: `${decision === 'approve' ? 'Approved' : 'Rejected'} phone "${device.label}" for ${worker.full_name}`,
      details: { userId: device.user_id },
    });
  })();
}

export function revokeDevice(db: DB, actor: Actor, device: DeviceRow): void {
  if (device.status === 'revoked') return;
  const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(device.user_id) as { full_name: string };
  db.prepare("UPDATE devices SET status = 'revoked', decided_at = ?, decided_by = ? WHERE id = ?").run(
    nowIso(),
    actor.id,
    device.id,
  );
  audit(db, actor, 'device.revoke', {
    companyId: device.company_id,
    entity: 'device',
    entityId: device.id,
    summary: `Removed phone "${device.label}" from ${worker.full_name}`,
    details: { userId: device.user_id, previousStatus: device.status },
  });
}

/** Loads the worker's device for a signed request and checks that it may be used. */
export function requireUsableDevice(db: DB, userId: number, keyId: string): DeviceRow {
  const device = db.prepare('SELECT * FROM devices WHERE key_id = ?').get(keyId) as DeviceRow | undefined;
  if (!device || device.user_id !== userId) {
    throw forbidden('This phone is not registered for your account.', 'DEVICE_UNKNOWN');
  }
  if (device.status === 'pending') throw forbidden('This phone is waiting for your manager’s approval.', 'DEVICE_PENDING');
  if (device.status !== 'active') throw forbidden('This phone is no longer approved for your account.', 'DEVICE_REVOKED');
  return device;
}
