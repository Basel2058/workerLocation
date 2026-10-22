import type { DB } from '../db';
import { storeMsg, type Msg } from '../i18n';
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
    /** A message (msg(...)) is shown to each reader in their language. */
    summary?: string | Msg;
    details?: Record<string, unknown>;
  } = {},
): void {
  const summary = storeMsg(opts.summary ?? '');
  db.prepare(
    `INSERT INTO audit_log (at, actor_id, actor_name, actor_role, company_id, action, entity, entity_id, summary, summary_i18n,
       details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    nowIso(),
    actor.id,
    actor.name,
    actor.role,
    opts.companyId ?? null,
    action,
    opts.entity ?? '',
    opts.entityId === undefined ? '' : String(opts.entityId),
    summary.english,
    summary.i18n,
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
    /** A message (msg(...)) is shown to each reader in their language. */
    message: string | Msg;
    details?: Record<string, unknown>;
    ip?: string;
  },
): number {
  const message = storeMsg(event.message);
  return Number(
    db
      .prepare(
        `INSERT INTO security_events (at, company_id, user_id, kind, severity, message, message_i18n, details, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nowIso(),
        event.companyId ?? null,
        event.userId ?? null,
        event.kind,
        event.severity,
        message.english,
        message.i18n,
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
