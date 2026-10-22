import fs from 'node:fs';
import path from 'node:path';
import type { JobRun } from '../../shared/types';
import type { AppConfig } from './config';
import { setSetting, type DB } from './db';
import type { RateLimiter } from './lib/rate-limit';
import { nowIso } from './lib/time';
import { companySettings } from './services/companies';
import { closeStaleEntries } from './services/entries';
import { systemLog } from './services/logs';
import { expirePresenceChecks } from './services/presence';
import type { PushService } from './services/push';

interface JobDeps {
  db: DB;
  config: AppConfig;
  limiter: RateLimiter;
  push: PushService;
}

interface JobDef {
  name: string;
  intervalMs: number;
  run: (deps: JobDeps) => string | Promise<string>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const JOBS: JobDef[] = [
  {
    name: 'attendance',
    intervalMs: 5 * MINUTE,
    run: ({ db, push }) => {
      const now = nowIso();
      const closed = closeStaleEntries(db, now);
      const expired = expirePresenceChecks(db, push, now);
      return `${closed} missing check-out(s) flagged, ${expired} presence check(s) expired`;
    },
  },
  {
    name: 'cleanup',
    intervalMs: HOUR,
    run: ({ db, limiter }) => {
      const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
      const challenges = db.prepare('DELETE FROM challenges WHERE created_at < ?').run(day(2)).changes;
      const sessions = db
        .prepare('DELETE FROM sessions WHERE (expires_at < ? OR revoked_at IS NOT NULL) AND last_seen_at < ?')
        .run(nowIso(), day(30)).changes;
      let photos = 0;
      const companies = db.prepare('SELECT id, settings FROM companies').all() as Array<{ id: number; settings: string }>;
      for (const c of companies) {
        const keepDays = Math.max(1, companySettings(c).photoRetentionDays);
        photos += db.prepare('DELETE FROM selfies WHERE company_id = ? AND created_at < ?').run(c.id, day(keepDays)).changes;
      }
      const logs = db.prepare('DELETE FROM system_logs WHERE at < ?').run(day(90)).changes;
      const events = db.prepare('DELETE FROM security_events WHERE at < ?').run(day(400)).changes;
      limiter.prune(24 * HOUR);
      db.pragma('incremental_vacuum(5000)');
      db.pragma('optimize');
      return `removed ${challenges} challenges, ${sessions} sessions, ${photos} photos, ${logs} logs, ${events} old alerts`;
    },
  },
  {
    name: 'integrity',
    intervalMs: 24 * HOUR,
    run: ({ db }) => {
      const result = db.pragma('quick_check', { simple: true }) as string;
      setSetting(db, 'integrity', JSON.stringify({ at: nowIso(), result }));
      if (result !== 'ok') throw new Error(`Database integrity check failed: ${result}`);
      return 'database ok';
    },
  },
  {
    name: 'backup',
    intervalMs: 24 * HOUR,
    run: async ({ db, config }) => {
      const keep = Number(process.env.BACKUP_KEEP ?? 7);
      if (config.dbFile === ':memory:' || keep <= 0) return 'skipped';
      const dir = path.join(config.dataDir, 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `onsite-${nowIso().slice(0, 10)}.db`);
      await db.backup(file);
      const old = fs
        .readdirSync(dir)
        .filter((f) => /^onsite-\d{4}-\d{2}-\d{2}\.db$/.test(f))
        .sort()
        .reverse()
        .slice(keep);
      for (const f of old) fs.rmSync(path.join(dir, f));
      return `saved ${path.basename(file)}, removed ${old.length} old backup(s)`;
    },
  },
];

export class JobRunner {
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<string>();

  constructor(
    private deps: JobDeps,
    private defs: JobDef[] = JOBS,
  ) {}

  start(): void {
    for (const def of this.defs) {
      // Stagger the first runs so a restart does not do everything at once.
      const first = setTimeout(() => void this.run(def.name), 5_000 + this.timers.length * 2_000);
      const every = setInterval(() => void this.run(def.name), def.intervalMs);
      first.unref();
      every.unref();
      this.timers.push(first, every);
    }
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  async run(name: string): Promise<JobRun> {
    const def = this.defs.find((d) => d.name === name);
    if (!def) throw new Error(`Unknown job ${name}`);
    const { db } = this.deps;
    if (this.running.has(name)) return this.get(name);
    this.running.add(name);
    const started = Date.now();
    db.prepare(
      `INSERT INTO job_runs (name, last_started_at) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at`,
    ).run(name, nowIso());
    try {
      const message = await def.run(this.deps);
      db.prepare(
        `UPDATE job_runs SET last_finished_at = ?, last_status = 'ok', last_message = ?, last_duration_ms = ?,
           run_count = run_count + 1 WHERE name = ?`,
      ).run(nowIso(), message, Date.now() - started, name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare(
        `UPDATE job_runs SET last_finished_at = ?, last_status = 'error', last_message = ?, last_duration_ms = ?,
           run_count = run_count + 1, fail_count = fail_count + 1 WHERE name = ?`,
      ).run(nowIso(), message, Date.now() - started, name);
      systemLog(db, 'error', `job:${name}`, message, { stack: err instanceof Error ? err.stack : undefined });
    } finally {
      this.running.delete(name);
    }
    return this.get(name);
  }

  get(name: string): JobRun {
    return this.list().find((j) => j.name === name)!;
  }

  list(): JobRun[] {
    const rows = this.deps.db.prepare('SELECT * FROM job_runs').all() as Array<{
      name: string;
      last_started_at: string | null;
      last_finished_at: string | null;
      last_status: string | null;
      last_message: string;
      last_duration_ms: number | null;
      run_count: number;
      fail_count: number;
    }>;
    return this.defs.map((def) => {
      const r = rows.find((x) => x.name === def.name);
      return {
        name: def.name,
        lastStartedAt: r?.last_started_at ?? null,
        lastFinishedAt: r?.last_finished_at ?? null,
        lastStatus: r?.last_status ?? null,
        lastMessage: r?.last_message ?? '',
        lastDurationMs: r?.last_duration_ms ?? null,
        runCount: r?.run_count ?? 0,
        failCount: r?.fail_count ?? 0,
        intervalMs: def.intervalMs,
      };
    });
  }
}
