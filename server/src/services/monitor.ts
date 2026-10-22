import fs from 'node:fs';
import type { DevOverview, HealthCheck, SystemLog } from '../../../shared/types';
import { parseJson, setSetting } from '../db';
import type { Ctx } from '../http';
import { nowIso } from '../lib/time';
import { EVENT_SELECT, toSecurityEvent } from './reviews';

export interface SystemLogRow {
  id: number;
  at: string;
  level: 'error' | 'warn' | 'info';
  source: string;
  message: string;
  details: string;
  resolved_at: string | null;
}

export const toSystemLog = (r: SystemLogRow): SystemLog => ({
  id: r.id,
  at: r.at,
  level: r.level,
  source: r.source,
  message: r.message,
  details: parseJson<Record<string, unknown>>(r.details, {}),
  resolvedAt: r.resolved_at,
});

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function diskFree(dir: string): { free: number; total: number } | null {
  try {
    const s = fs.statfsSync(dir);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

const GB = 1024 ** 3;

export function getDevOverview(ctx: Ctx): DevOverview {
  const { db, config, metrics } = ctx;
  const q = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const checks: HealthCheck[] = [];

  try {
    setSetting(db, 'health_probe', nowIso());
    checks.push({ name: 'Database', ok: true, detail: 'Reads and writes work' });
  } catch (err) {
    checks.push({ name: 'Database', ok: false, detail: `Write failed: ${(err as Error).message}` });
  }

  const integrity = parseJson<{ at: string; result: string } | null>(
    (db.prepare("SELECT value FROM app_settings WHERE key = 'integrity'").get() as { value: string } | undefined)?.value,
    null,
  );
  checks.push({
    name: 'Data integrity',
    ok: !integrity || integrity.result === 'ok',
    detail: integrity ? `Last check ${integrity.at.slice(0, 16).replace('T', ' ')} UTC: ${integrity.result}` : 'Not checked yet',
  });

  const disk = config.dbFile === ':memory:' ? null : diskFree(config.dataDir);
  if (disk) {
    const ok = disk.free > 0.5 * GB && disk.free / disk.total > 0.05;
    checks.push({ name: 'Disk space', ok, detail: `${(disk.free / GB).toFixed(1)} GB free of ${(disk.total / GB).toFixed(1)} GB` });
  }

  const jobs = ctx.jobs.list();
  const lateJobs = config.runJobs
    ? jobs.filter((j) => {
        if (j.lastStatus === 'error') return true;
        const last = j.lastFinishedAt ? Date.parse(j.lastFinishedAt) : Date.parse(ctx.startedAt);
        return Date.now() - last > j.intervalMs * 2 + 60_000;
      })
    : [];
  checks.push({
    name: 'Background jobs',
    ok: lateJobs.length === 0,
    detail: lateJobs.length ? `Problem with: ${lateJobs.map((j) => j.name).join(', ')}` : 'All jobs ran on time',
  });

  const hour = metrics.lastHour5xx();
  checks.push({
    name: 'Server errors',
    ok: hour.e5xx < 5 || hour.e5xx / Math.max(1, hour.total) < 0.02,
    detail: `${hour.e5xx} errors in ${hour.total} requests during the last hour`,
  });

  const loopMs = metrics.eventLoopP99Ms();
  checks.push({ name: 'Responsiveness', ok: loopMs < 250, detail: `Event loop delay p99 ${loopMs} ms` });

  const punchRows = db
    .prepare(`SELECT substr(at, 1, 13) AS h, result, count(*) AS n FROM punches WHERE at >= ? GROUP BY h, result`)
    .all(since24h) as Array<{ h: string; result: 'accepted' | 'review' | 'rejected'; n: number }>;
  const punchesByHour: DevOverview['punchesByHour'] = [];
  for (let i = 23; i >= 0; i--) {
    const hourKey = new Date(Date.now() - i * 3_600_000).toISOString().slice(0, 13);
    const pick = (r: string) => punchRows.find((p) => p.h === hourKey && p.result === r)?.n ?? 0;
    punchesByHour.push({ hour: `${hourKey}:00:00.000Z`, accepted: pick('accepted'), review: pick('review'), rejected: pick('rejected') });
  }
  const today = punchesByHour.reduce(
    (acc, h) => ({ accepted: acc.accepted + h.accepted, review: acc.review + h.review, rejected: acc.rejected + h.rejected }),
    { accepted: 0, review: 0, rejected: 0 },
  );

  const recentErrors = (
    db
      .prepare("SELECT * FROM system_logs WHERE level = 'error' AND resolved_at IS NULL ORDER BY id DESC LIMIT 8")
      .all() as SystemLogRow[]
  ).map(toSystemLog);
  const recentSecurity = (
    db
      .prepare(`${EVENT_SELECT} WHERE ev.severity IN ('warn', 'high') ORDER BY ev.id DESC LIMIT 8`)
      .all() as Parameters<typeof toSecurityEvent>[0][]
  ).map(toSecurityEvent);

  const dbBytes = config.dbFile === ':memory:' ? 0 : fileSize(config.dbFile) + fileSize(`${config.dbFile}-wal`);

  return {
    status: checks.every((c) => c.ok) ? 'ok' : 'degraded',
    checks,
    system: {
      version: config.version,
      node: process.version,
      startedAt: ctx.startedAt,
      uptimeSec: Math.round(process.uptime()),
      dbBytes,
      selfieBytes: q('SELECT coalesce(sum(bytes), 0) AS n FROM selfies'),
      diskFreeBytes: disk?.free ?? null,
      rssBytes: process.memoryUsage().rss,
      eventLoopP99Ms: loopMs,
      env: config.env,
    },
    stats: {
      companies: q('SELECT count(*) AS n FROM companies WHERE active = 1'),
      managers: q("SELECT count(*) AS n FROM users WHERE role = 'manager' AND active = 1"),
      workers: q("SELECT count(*) AS n FROM users WHERE role = 'worker' AND active = 1"),
      sitesActive: q('SELECT count(*) AS n FROM sites WHERE active = 1'),
      punchesToday: today,
      openEntries: q("SELECT count(*) AS n FROM time_entries WHERE status = 'open'"),
      pendingReviews:
        q("SELECT count(*) AS n FROM devices WHERE status = 'pending'") +
        q("SELECT count(*) AS n FROM punches WHERE review_status = 'pending'"),
      activeSessions: q('SELECT count(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?', nowIso()),
      loginsFailed24h: q("SELECT count(*) AS n FROM security_events WHERE kind = 'login_failed' AND at >= ?", since24h),
      requests24h: metrics.last24h(),
    },
    punchesByHour,
    rejectReasons24h: db
      .prepare(
        `SELECT reason, count(*) AS count FROM punches WHERE result = 'rejected' AND at >= ? AND reason IS NOT NULL
         GROUP BY reason ORDER BY count DESC`,
      )
      .all(since24h) as Array<{ reason: string; count: number }>,
    jobs,
    recentErrors,
    recentSecurity,
  };
}
