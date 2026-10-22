import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '../../shared/types';
import type { AppConfig } from './config';
import type { DB } from './db';
import type { CompanyRow, SessionRow, UserRow } from './db/rows';
import { badRequest, forbidden, notFound, tooMany, unauthorized, AppError } from './lib/errors';
import type { Metrics } from './lib/metrics';
import type { RateLimiter } from './lib/rate-limit';
import type { Actor } from './services/logs';
import type { PushService } from './services/push';
import { tr } from './i18n';
import type { JobRunner } from './jobs';

export interface Ctx {
  db: DB;
  config: AppConfig;
  limiter: RateLimiter;
  metrics: Metrics;
  push: PushService;
  jobs: JobRunner;
  startedAt: string;
}

export interface AuthInfo {
  session: SessionRow;
  user: UserRow;
  company: CompanyRow | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
  interface FastifyRequest {
    auth: AuthInfo | null;
  }
}

export interface AuthOptions {
  /** Allow the request while the user still has to replace a temporary password. */
  allowPasswordChange?: boolean;
}

export function requireAuth(req: FastifyRequest, opts: AuthOptions = {}): AuthInfo {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  if (auth.session.mfa_pending) throw unauthorized('Enter your verification code.', 'MFA_REQUIRED');
  if (auth.user.must_change_password && !opts.allowPasswordChange) {
    throw forbidden('Please choose a new password first.', 'PASSWORD_CHANGE_REQUIRED');
  }
  if (auth.company && !auth.company.active && auth.user.role !== 'developer') {
    throw forbidden('This company account is not active. Contact the app owner.', 'COMPANY_INACTIVE');
  }
  return auth;
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): AuthInfo {
  const auth = requireAuth(req);
  if (!roles.includes(auth.user.role)) throw forbidden();
  return auth;
}

export function actorOf(req: FastifyRequest): Actor {
  const user = req.auth?.user;
  return user
    ? { id: user.id, name: user.full_name, role: user.role, ip: req.ip }
    : { id: null, name: 'Anonymous', role: 'anonymous', ip: req.ip };
}

export interface CompanyScope {
  auth: AuthInfo;
  company: CompanyRow;
  tz: string;
  actor: Actor;
}

/**
 * Resolves the company a manager-level request acts on. Managers are pinned to their own company;
 * the developer picks one with the `x-company-id` header (used by "open dashboard" in the console).
 */
export function companyScope(req: FastifyRequest): CompanyScope {
  const auth = requireRole(req, 'manager', 'developer');
  let company: CompanyRow | null = auth.company;
  if (auth.user.role === 'developer') {
    const raw = req.headers['x-company-id'];
    const id = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Choose a company first.', 'COMPANY_REQUIRED');
    company = (req.server.ctx.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as CompanyRow) ?? null;
    if (!company) throw notFound('Company not found.');
  }
  if (!company) throw forbidden();
  return { auth, company, tz: company.timezone, actor: actorOf(req) };
}

export function rateLimit(req: FastifyRequest, key: string, limit: number, windowMs: number, message?: string): void {
  const res = req.server.ctx.limiter.hit(key, limit, windowMs);
  if (!res.allowed) {
    const sec = Math.ceil(res.retryAfterMs / 1000);
    const wait =
      sec < 90
        ? tr('Too many attempts. Try again in {count} seconds.', { count: sec })
        : tr('Too many attempts. Try again in {count} minutes.', { count: Math.ceil(sec / 60) });
    throw tooMany(message ?? wait, sec);
  }
}

/** Parses a positive integer route/query parameter. */
export function idParam(value: unknown, name = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Invalid request.', 'BAD_REQUEST', { field: name });
  return n;
}

export function sendError(reply: FastifyReply, err: AppError) {
  if (err.statusCode === 429 && err.details && typeof err.details === 'object' && 'retryAfterSec' in err.details) {
    reply.header('retry-after', String((err.details as { retryAfterSec: number }).retryAfterSec));
  }
  return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
}
