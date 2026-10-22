import { z } from 'zod';
import type { PunchChallenge, PunchOutcome, PunchPayload, SignedEnvelope } from '../../../shared/types';
import { parseJson, type DB } from '../db';
import type { CompanyRow, DeviceRow, EntryRow, ShiftRow, SiteRow, UserRow } from '../db/rows';
import { randomToken, sha256Hex, verifyDeviceSignature, type EcPublicJwk } from '../lib/crypto';
import { msg, tr } from '../i18n';
import { badRequest, conflict } from '../lib/errors';
import { dayRange, minutesBetween, nowIso, todayLocal } from '../lib/time';
import { consumeChallenge, createChallenge, decideSelfie } from './challenges';
import { companySettings, listSites } from './companies';
import { requireUsableDevice } from './devices';
import { closeStaleEntries, openEntry } from './entries';
import { securityEvent } from './logs';
import { evaluateRisk, HIGH_RISK_SCORE, type RiskResult, type RiskSite } from './risk';
import { findShiftForCheckIn } from './shifts';

const sampleSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  acc: z.number(),
  alt: z.number().nullish(),
  altAcc: z.number().nullish(),
  heading: z.number().nullish(),
  speed: z.number().nullish(),
  ts: z.number(),
});

const payloadSchema = z.object({
  v: z.literal(1),
  nonce: z.string().min(16).max(100),
  type: z.enum(['in', 'out', 'check']),
  checkId: z.number().int().positive().optional(),
  samples: z.array(sampleSchema).min(1).max(40),
  clientTime: z.number(),
  tz: z.string().max(100),
  env: z.object({
    webdriver: z.boolean(),
    geoNative: z.boolean(),
    touchPoints: z.number().int().min(0).max(100),
    platform: z.string().max(100),
    standalone: z.boolean(),
    mobileHint: z.boolean().nullable(),
    screen: z.string().max(50),
  }),
  selfie: z.string().max(1_000_000).optional(),
  request: z.object({ note: z.string().max(500) }).optional(),
});

export interface PunchContext {
  db: DB;
  user: UserRow;
  company: CompanyRow;
  ip: string;
  userAgent: string;
}

/** Verifies the device signature over the payload and parses it. */
export function verifySignedPayload(ctx: PunchContext, device: DeviceRow, envelope: SignedEnvelope): PunchPayload {
  const jwk = parseJson<EcPublicJwk | null>(device.public_key, null);
  if (!jwk || !verifyDeviceSignature(jwk, envelope.payload, envelope.signature)) {
    securityEvent(ctx.db, {
      companyId: ctx.company.id,
      userId: ctx.user.id,
      kind: 'bad_signature',
      severity: 'high',
      message: msg('A check-in for {name} had an invalid phone signature (tampered request).', { name: ctx.user.full_name }),
      ip: ctx.ip,
    });
    throw badRequest('This request could not be verified.', 'BAD_SIGNATURE');
  }
  try {
    return payloadSchema.parse(JSON.parse(envelope.payload)) as PunchPayload;
  } catch {
    throw badRequest('Invalid request.');
  }
}

const JPEG_DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;

export function decodeSelfie(dataUrl: string): Buffer {
  const m = JPEG_DATA_URL.exec(dataUrl);
  if (!m) throw badRequest('The photo could not be read.', 'BAD_SELFIE');
  const data = Buffer.from(m[1]!, 'base64');
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (!isJpeg || data.length < 1000 || data.length > 700_000) throw badRequest('The photo could not be read.', 'BAD_SELFIE');
  return data;
}

/**
 * True when the photo is byte-identical to an earlier one. The worker's own photo from the last 15 minutes
 * is allowed again (e.g. a rejected check-in re-sent to the manager as a request).
 */
export function isReusedSelfie(db: DB, hash: string, userId: number): boolean {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  return !!db
    .prepare('SELECT 1 FROM selfies WHERE sha256 = ? AND NOT (user_id = ? AND created_at > ?) LIMIT 1')
    .get(hash, userId, since);
}

export function storeSelfie(db: DB, companyId: number, userId: number, data: Buffer, hash: string): string {
  const id = randomToken(16);
  db.prepare(
    'INSERT INTO selfies (id, company_id, user_id, mime, data, bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, companyId, userId, 'image/jpeg', data, data.length, hash, nowIso());
  return id;
}

export function toRiskSite(row: SiteRow): RiskSite {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    radius_m: row.radius_m,
    networks: parseJson<string[]>(row.networks, []),
    require_network: !!row.require_network,
  };
}

/** Context the risk engine compares a new location against. */
export function riskHistory(db: DB, company: CompanyRow, workerId: number, now: string) {
  const today = dayRange(todayLocal(company.timezone, now), company.timezone);
  const prev = db
    .prepare(
      `SELECT lat, lng, at FROM (
         SELECT lat, lng, at FROM punches WHERE worker_id = ? AND lat IS NOT NULL
         UNION ALL
         SELECT lat, lng, responded_at AS at FROM presence_checks WHERE worker_id = ? AND lat IS NOT NULL
       ) ORDER BY at DESC LIMIT 1`,
    )
    .get(workerId, workerId) as { lat: number; lng: number; at: string } | undefined;
  const othersToday = db
    .prepare('SELECT lat, lng FROM punches WHERE company_id = ? AND worker_id <> ? AND at >= ? AND lat IS NOT NULL LIMIT 1000')
    .all(company.id, workerId, today.start) as Array<{ lat: number; lng: number }>;
  const ownEarlier = db
    .prepare('SELECT lat, lng FROM punches WHERE worker_id = ? AND at < ? AND lat IS NOT NULL ORDER BY at DESC LIMIT 100')
    .all(workerId, today.start) as Array<{ lat: number; lng: number }>;
  const recentRejections = (
    db
      .prepare("SELECT count(*) AS n FROM punches WHERE worker_id = ? AND result = 'rejected' AND at > ?")
      .get(workerId, new Date(Date.parse(now) - 15 * 60_000).toISOString()) as { n: number }
  ).n;
  return {
    previous: prev ? { lat: prev.lat, lng: prev.lng, atMs: Date.parse(prev.at) } : null,
    othersToday,
    ownEarlier,
    recentRejections,
  };
}

export function issuePunchChallenge(ctx: PunchContext, type: 'in' | 'out', keyId: string): PunchChallenge {
  const { db, user, company } = ctx;
  const device = requireUsableDevice(db, user.id, keyId);
  closeStaleEntries(db, nowIso(), { workerId: user.id });
  const open = openEntry(db, user.id);
  if (type === 'in' && open) throw conflict('You are already checked in.', 'ALREADY_IN');
  if (type === 'out' && !open) throw conflict('You are not checked in.', 'NOT_IN');
  const s = companySettings(company);
  const requireSelfie = decideSelfie(db, user.id, s.selfieMode, s.selfieRandomPercent);
  const challenge = createChallenge(db, { userId: user.id, deviceId: device.id, purpose: `punch:${type}`, requireSelfie });
  return { nonce: challenge.nonce, expiresAt: challenge.expires_at, requireSelfie };
}


function outcomeMessage(type: 'in' | 'out', risk: RiskResult, shift: ShiftRow | null, tz: string): string {
  const site = risk.site?.name;
  if (risk.result === 'accepted') {
    if (!site) return type === 'in' ? tr('Checked in') : tr('Checked out');
    return type === 'in' ? tr('Checked in at {site}', { site }) : tr('Checked out from {site}', { site });
  }
  if (risk.result === 'review') {
    return type === 'in'
      ? tr('Checked in. Your manager will confirm this check-in.')
      : tr('Checked out. Your manager will confirm this check-out.');
  }
  switch (risk.reason) {
    case 'OUTSIDE_GEOFENCE':
      return site
        ? tr('You are {distance} from {site}. Go to your workplace and try again.', { distance: { meters: risk.distanceM ?? 0 }, site })
        : tr('You are {distance} from your workplace. Go to your workplace and try again.', { distance: { meters: risk.distanceM ?? 0 } });
    case 'LOW_ACCURACY':
      return tr('Your location is not precise enough (±{accuracy}). Turn on precise location, step outside or near a window, and try again.', {
        accuracy: { meters: risk.best?.acc ?? 0 },
      });
    case 'STALE_LOCATION':
    case 'NO_LOCATION':
      return tr('We could not get a fresh location from your phone. Please try again.');
    case 'NETWORK_REQUIRED':
      return site ? tr('Connect to the {site} Wi-Fi and try again.', { site }) : tr('Connect to the workplace Wi-Fi and try again.');
    case 'NO_SITES':
      return tr('No workplace is set up for your company yet. Please contact your manager.');
    case 'NO_SHIFT':
      return shift
        ? tr('Your shift starts at {time}.', { time: { at: shift.starts_at, tz, style: 'time' } })
        : tr('You do not have a shift right now.');
    default:
      return tr('This could not be verified. Please talk to your manager.');
  }
}

const REQUESTABLE = new Set(['OUTSIDE_GEOFENCE', 'LOW_ACCURACY', 'NETWORK_REQUIRED']);
const ALERT_FLAGS = new Set([
  'ACCURACY_ZERO',
  'API_TAMPERED',
  'AUTOMATION',
  'EMULATED_DEVICE',
  'MATCHES_SITE_CENTER',
  'IMPOSSIBLE_TRAVEL',
  'SELFIE_DUPLICATE',
]);

export function submitPunch(ctx: PunchContext, envelope: SignedEnvelope): PunchOutcome {
  const { db, user, company } = ctx;
  const device = requireUsableDevice(db, user.id, envelope.keyId);
  const payload = verifySignedPayload(ctx, device, envelope);
  if (payload.type === 'check') throw badRequest('Invalid request.');
  const type = payload.type;
  const challenge = consumeChallenge(db, { nonce: payload.nonce, userId: user.id, deviceId: device.id, purpose: `punch:${type}` });

  const now = nowIso();
  const nowMs = Date.parse(now);
  closeStaleEntries(db, now, { workerId: user.id });
  const open = openEntry(db, user.id);
  if (type === 'in' && open) throw conflict('You are already checked in.', 'ALREADY_IN');
  if (type === 'out' && !open) throw conflict('You are not checked in.', 'NOT_IN');

  const last = db
    .prepare("SELECT at FROM punches WHERE worker_id = ? AND result <> 'rejected' ORDER BY at DESC LIMIT 1")
    .get(user.id) as { at: string } | undefined;
  if (last && nowMs - Date.parse(last.at) < 60_000) {
    throw conflict('You just did that. Wait a minute and try again.', 'TOO_SOON');
  }

  if (challenge.require_selfie && !payload.selfie) throw badRequest('A photo is needed.', 'SELFIE_REQUIRED');
  const selfie = payload.selfie ? decodeSelfie(payload.selfie) : null;
  const selfieHash = selfie ? sha256Hex(selfie) : null;
  const selfieDuplicate = !!selfieHash && isReusedSelfie(db, selfieHash, user.id);

  const settings = companySettings(company);
  const shift: ShiftRow | null =
    type === 'in'
      ? findShiftForCheckIn(db, user.id, now, settings.earlyCheckInMin)
      : open!.shift_id
        ? ((db.prepare('SELECT * FROM shifts WHERE id = ?').get(open!.shift_id) as ShiftRow | undefined) ?? null)
        : null;

  let risk: RiskResult;
  if (type === 'in' && !shift && !settings.allowUnscheduled) {
    const upcoming = db
      .prepare('SELECT * FROM shifts WHERE worker_id = ? AND starts_at > ? ORDER BY starts_at LIMIT 1')
      .get(user.id, now) as ShiftRow | undefined;
    risk = { result: 'rejected', reason: 'NO_SHIFT', best: null, site: null, distanceM: null, networkMatch: false, flags: [], score: 0 };
    return persist(ctx, { device, payload, risk, shift: upcoming ?? null, open, selfie, selfieHash, now, recordShift: null });
  }

  const history = riskHistory(db, company, user.id, now);
  risk = evaluateRisk({
    kind: type,
    nowMs,
    samples: payload.samples,
    clientTime: payload.clientTime,
    env: payload.env,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    settings,
    sites: listSites(db, company.id, true).map(toRiskSite),
    targetSiteId: type === 'in' ? (shift?.site_id ?? null) : open!.site_id,
    ...history,
    deviceApprovedAtMs: device.decided_at ? Date.parse(device.decided_at) : null,
    selfieDuplicate,
    request: !!payload.request,
    unscheduled: type === 'in' && !shift,
  });
  return persist(ctx, { device, payload, risk, shift, open, selfie, selfieHash, now, recordShift: shift });
}

function persist(
  ctx: PunchContext,
  p: {
    device: DeviceRow;
    payload: PunchPayload;
    risk: RiskResult;
    shift: ShiftRow | null;
    recordShift: ShiftRow | null;
    open: EntryRow | null;
    selfie: Buffer | null;
    selfieHash: string | null;
    now: string;
  },
): PunchOutcome {
  const { db, user, company } = ctx;
  const { risk, payload, now } = p;
  const type = payload.type as 'in' | 'out';
  const tz = company.timezone;
  const settings = companySettings(company);

  db.transaction(() => {
    const selfieId = p.selfie && p.selfieHash ? storeSelfie(db, company.id, user.id, p.selfie, p.selfieHash) : null;
    const best = risk.best;
    const punchId = Number(
      db
        .prepare(
          `INSERT INTO punches (company_id, worker_id, device_id, type, result, reason, at, site_id, shift_id, lat, lng,
             accuracy, distance_m, samples, client, ip, network_match, selfie_id, risk_score, flags, note, review_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          company.id,
          user.id,
          p.device.id,
          type,
          risk.result,
          risk.reason,
          now,
          risk.site?.id ?? null,
          p.recordShift?.id ?? null,
          best?.lat ?? null,
          best?.lng ?? null,
          best?.acc ?? null,
          risk.distanceM,
          JSON.stringify(payload.samples.slice(0, 40)),
          JSON.stringify({ clientTime: payload.clientTime, tz: payload.tz, env: payload.env, userAgent: ctx.userAgent.slice(0, 400) }),
          ctx.ip,
          risk.networkMatch ? 1 : 0,
          selfieId,
          risk.score,
          JSON.stringify(risk.flags),
          payload.request?.note.trim() ?? '',
          risk.result === 'review' ? 'pending' : null,
          now,
        ).lastInsertRowid,
    );

    if (risk.result !== 'rejected') {
      let entryId: number;
      if (type === 'in') {
        entryId = Number(
          db
            .prepare(
              `INSERT INTO time_entries (company_id, worker_id, site_id, shift_id, in_punch_id, clock_in_at, status, source,
                 created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'open', 'app', ?, ?)`,
            )
            .run(company.id, user.id, risk.site?.id ?? null, p.recordShift?.id ?? null, punchId, now, now, now).lastInsertRowid,
        );
      } else {
        entryId = p.open!.id;
        db.prepare(
          "UPDATE time_entries SET clock_out_at = ?, out_punch_id = ?, status = 'closed', updated_at = ? WHERE id = ? AND status = 'open'",
        ).run(now, punchId, now, entryId);
      }
      db.prepare('UPDATE punches SET entry_id = ? WHERE id = ?').run(entryId, punchId);
    }
    db.prepare('UPDATE devices SET last_used_at = ? WHERE id = ?').run(now, p.device.id);

    const alarming = risk.flags.filter((f) => ALERT_FLAGS.has(f));
    if (risk.result === 'rejected' && (risk.score >= HIGH_RISK_SCORE || alarming.length > 0)) {
      securityEvent(db, {
        companyId: company.id,
        userId: user.id,
        kind: 'suspicious_punch',
        severity: 'high',
        message:
          type === 'in'
            ? msg('Blocked a suspicious check-in by {name}.', { name: user.full_name })
            : msg('Blocked a suspicious check-out by {name}.', { name: user.full_name }),
        details: { punchId, flags: risk.flags, score: risk.score, reason: risk.reason },
        ip: ctx.ip,
      });
    } else if (risk.result === 'rejected') {
      const recent = (
        db
          .prepare("SELECT count(*) AS n FROM punches WHERE worker_id = ? AND result = 'rejected' AND at > ?")
          .get(user.id, new Date(Date.parse(now) - 15 * 60_000).toISOString()) as { n: number }
      ).n;
      const alreadyWarned = db
        .prepare("SELECT 1 FROM security_events WHERE user_id = ? AND kind = 'repeated_rejections' AND at > ?")
        .get(user.id, new Date(Date.parse(now) - 30 * 60_000).toISOString());
      if (recent >= 4 && !alreadyWarned) {
        securityEvent(db, {
          companyId: company.id,
          userId: user.id,
          kind: 'repeated_rejections',
          severity: 'warn',
          message:
            type === 'in'
              ? msg('{name} had {count} failed check-in attempts in 15 minutes.', { name: user.full_name, count: recent })
              : msg('{name} had {count} failed check-out attempts in 15 minutes.', { name: user.full_name, count: recent }),
          details: { punchId, lastReason: risk.reason, distanceM: risk.distanceM },
          ip: ctx.ip,
        });
      }
    }
  })();

  const shift = p.shift;
  const late = type === 'in' && p.recordShift ? minutesBetween(p.recordShift.starts_at, now) : null;
  return {
    result: risk.result,
    type,
    at: now,
    siteName: risk.site?.name ?? null,
    distanceM: risk.result === 'rejected' ? risk.distanceM : null,
    reason: risk.result === 'rejected' ? risk.reason : null,
    lateMinutes: risk.result !== 'rejected' && late !== null && late > settings.lateGraceMin ? late : null,
    message: outcomeMessage(type, risk, shift, tz),
    canRequest: risk.result === 'rejected' && !!risk.reason && REQUESTABLE.has(risk.reason),
  };
}

