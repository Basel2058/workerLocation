import type { DB } from '../db';
import { nowIso } from '../lib/time';

export interface Actor {
  id: number | null;
  name: string;
  role: string;
  ip?: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, name: 'System', role: 'system' };

/** Records who changed what. Every manager/developer change goes through here. */
export function audit(
  db: DB,
  actor: Actor,
  action: string,
  opts: {
    companyId?: number | null;
    entity?: string;
    entityId?: string | number;
    summary?: string;
    details?: Record<string, unknown>;
  } = {},
): void {
  db.prepare(
    `INSERT INTO audit_log (at, actor_id, actor_name, actor_role, company_id, action, entity, entity_id, summary, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    nowIso(),
    actor.id,
    actor.name,
    actor.role,
    opts.companyId ?? null,
    action,
    opts.entity ?? '',
    opts.entityId === undefined ? '' : String(opts.entityId),
    opts.summary ?? '',
    JSON.stringify(opts.details ?? {}),
    actor.ip ?? '',
  );
}

export type Severity = 'info' | 'warn' | 'high';

/** Security-relevant events (failed logins, device conflicts, suspicious punches). */
export function securityEvent(
  db: DB,
  event: {
    companyId?: number | null;
    userId?: number | null;
    kind: string;
    severity: Severity;
    message: string;
    details?: Record<string, unknown>;
    ip?: string;
  },
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO security_events (at, company_id, user_id, kind, severity, message, details, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nowIso(),
        event.companyId ?? null,
        event.userId ?? null,
        event.kind,
        event.severity,
        event.message,
        JSON.stringify(event.details ?? {}),
        event.ip ?? '',
      ).lastInsertRowid,
  );
}

/** Operational log shown in the developer console (errors from the server, browsers and jobs). */
export function systemLog(
  db: DB,
  level: 'error' | 'warn' | 'info',
  source: string,
  message: string,
  details: Record<string, unknown> = {},
): void {
  try {
    db.prepare('INSERT INTO system_logs (at, level, source, message, details) VALUES (?, ?, ?, ?, ?)').run(
      nowIso(),
      level,
      source.slice(0, 100),
      message.slice(0, 2000),
      JSON.stringify(details).slice(0, 20_000),
    );
  } catch {
    // Logging must never break the request that triggered it (e.g. when the disk is full).
  }
}
