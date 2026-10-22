import type { ReviewQueue, SecurityEvent } from '../../../shared/types';
import { parseJson, type DB } from '../db';
import type { CompanyRow, DeviceRow, SecurityEventRow } from '../db/rows';
import { msg, renderStored, type Msg } from '../i18n';
import { notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import { companySettings } from './companies';
import { DEVICE_LIST_SQL, toDevice } from './devices';
import { ENTRY_SELECT, PUNCH_SELECT, toPunchSummary, toTimeEntries, type EntryListRow } from './entries';
import { audit, type Actor } from './logs';

/** Security event kinds a manager should look at (others are only for the developer console). */
export const MANAGER_ALERT_KINDS = [
  'device_conflict',
  'suspicious_punch',
  'repeated_rejections',
  'presence_failed',
  'presence_expired',
  'bad_signature',
  'replay',
];

interface EventListRow extends SecurityEventRow {
  company_name: string | null;
  user_name: string | null;
  resolved_by_name: string | null;
}

export const EVENT_SELECT = `
  SELECT ev.*, c.name AS company_name, u.full_name AS user_name, r.full_name AS resolved_by_name
  FROM security_events ev
  LEFT JOIN companies c ON c.id = ev.company_id
  LEFT JOIN users u ON u.id = ev.user_id
  LEFT JOIN users r ON r.id = ev.resolved_by`;

export function toSecurityEvent(row: EventListRow): SecurityEvent {
  return {
    id: row.id,
    at: row.at,
    companyId: row.company_id,
    companyName: row.company_name,
    userId: row.user_id,
    userName: row.user_name,
    kind: row.kind,
    severity: row.severity,
    message: renderStored(row.message, row.message_i18n),
    details: parseJson<Record<string, unknown>>(row.details, {}),
    ip: row.ip,
    resolvedAt: row.resolved_at,
    resolvedByName: row.resolved_by_name,
  };
}

const kindList = MANAGER_ALERT_KINDS.map((k) => `'${k}'`).join(',');

export function getReviewQueue(db: DB, company: CompanyRow): ReviewQueue {
  const devices = (
    db
      .prepare(`${DEVICE_LIST_SQL} WHERE d.company_id = ? AND d.status = 'pending' ORDER BY d.created_at`)
      .all(company.id) as Array<DeviceRow & { decided_by_name: string | null; similar_name: string | null }>
  ).map((row) => {
    const user = db.prepare('SELECT full_name, phone FROM users WHERE id = ?').get(row.user_id) as {
      full_name: string;
      phone: string;
    };
    const current = db
      .prepare("SELECT label, last_used_at FROM devices WHERE user_id = ? AND status = 'active' LIMIT 1")
      .get(row.user_id) as { label: string; last_used_at: string | null } | undefined;
    return {
      ...toDevice(row),
      userName: user.full_name,
      userPhone: user.phone,
      currentDevice: current ? { label: current.label, lastUsedAt: current.last_used_at } : null,
    };
  });

  const punches = (
    db
      .prepare(
        `SELECT q.*, w.full_name AS worker_name, w.phone AS worker_phone FROM (${PUNCH_SELECT}) q
         JOIN users w ON w.id = q.worker_id
         WHERE q.company_id = ? AND q.review_status = 'pending' ORDER BY q.at`,
      )
      .all(company.id) as Array<Parameters<typeof toPunchSummary>[0] & { worker_name: string; worker_phone: string }>
  ).map((row) => ({
    ...toPunchSummary(row),
    workerId: row.worker_id,
    workerName: row.worker_name,
    workerPhone: row.worker_phone,
    entryId: row.entry_id,
  }));

  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const incompleteRows = db
    .prepare(`${ENTRY_SELECT} WHERE e.company_id = ? AND e.status = 'incomplete' AND e.clock_in_at >= ? ORDER BY e.clock_in_at`)
    .all(company.id, since) as EntryListRow[];
  const incomplete = toTimeEntries(db, incompleteRows, companySettings(company).lateGraceMin);

  const alerts = (
    db
      .prepare(
        `${EVENT_SELECT} WHERE ev.company_id = ? AND ev.resolved_at IS NULL AND ev.kind IN (${kindList})
         AND ev.at >= ? ORDER BY ev.id DESC LIMIT 100`,
      )
      .all(company.id, new Date(Date.now() - 30 * 86_400_000).toISOString()) as EventListRow[]
  ).map(toSecurityEvent);

  return {
    devices,
    punches,
    incomplete,
    alerts,
    total: devices.length + punches.length + incomplete.length + alerts.length,
  };
}

export function pendingReviewCount(db: DB, companyId: number): number {
  const q = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  return (
    q("SELECT count(*) AS n FROM devices WHERE company_id = ? AND status = 'pending'", companyId) +
    q("SELECT count(*) AS n FROM punches WHERE company_id = ? AND review_status = 'pending'", companyId) +
    q(
      "SELECT count(*) AS n FROM time_entries WHERE company_id = ? AND status = 'incomplete' AND clock_in_at >= ?",
      companyId,
      new Date(Date.now() - 60 * 86_400_000).toISOString(),
    ) +
    q(
      `SELECT count(*) AS n FROM security_events WHERE company_id = ? AND resolved_at IS NULL AND kind IN (${kindList}) AND at >= ?`,
      companyId,
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
    )
  );
}

export function resolveSecurityEvent(db: DB, actor: Actor, companyId: number | null, id: number): void {
  const row = db.prepare('SELECT * FROM security_events WHERE id = ?').get(id) as SecurityEventRow | undefined;
  if (!row || (companyId !== null && row.company_id !== companyId)) throw notFound('Alert not found.');
  if (row.resolved_at) return;
  db.prepare('UPDATE security_events SET resolved_at = ?, resolved_by = ? WHERE id = ?').run(nowIso(), actor.id, id);
  audit(db, actor, 'alert.resolve', {
    companyId: row.company_id,
    entity: 'security_event',
    entityId: id,
    summary: row.message_i18n
      ? msg('Marked alert as handled: {alert}', { alert: { msg: JSON.parse(row.message_i18n) as Msg } })
      : msg('Marked alert as handled: {alert}', { alert: row.message }),
  });
}
