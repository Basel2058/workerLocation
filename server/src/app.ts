import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { loadSession, SESSION_COOKIE, touchSession } from './auth/sessions';
import type { AppConfig } from './config';
import { openDatabase, type DB } from './db';
import type { CompanyRow } from './db/rows';
import { sendError, type Ctx } from './http';
import { JobRunner } from './jobs';
import { AppError } from './lib/errors';
import { Metrics } from './lib/metrics';
import { RateLimiter } from './lib/rate-limit';
import { nowIso } from './lib/time';
import authRoutes from './routes/auth';
import devRoutes from './routes/dev';
import managerRoutes from './routes/manager';
import publicRoutes from './routes/public';
import workerRoutes from './routes/worker';
import { systemLog } from './services/logs';
import { createPushService } from './services/push';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function tileOrigin(url: string): string {
  const m = /^(https?:\/\/[^/]+)/.exec(url.replace(/\{s\}/g, '*'));
  return m ? m[1]! : '';
}

export async function buildApp(config: AppConfig, opts: { db?: DB } = {}): Promise<FastifyInstance> {
  const db = opts.db ?? openDatabase(config.dbFile);
  const app = Fastify({
    logger:
      config.env === 'test'
        ? false
        : { level: config.env === 'production' ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy:
      typeof config.trustProxy === 'number'
        ? (() => {
            const hops = config.trustProxy;
            return (_address: string, hop: number) => hop < hops;
          })()
        : config.trustProxy,
    bodyLimit: 256 * 1024,
  });

  const limiter = new RateLimiter();
  const push = createPushService(db, config);
  const metrics = new Metrics();
  const jobs = new JobRunner({ db, config, limiter, push });
  const ctx: Ctx = { db, config, limiter, metrics, push, jobs, startedAt: nowIso() };
  app.decorate('ctx', ctx);
  app.decorateRequest('auth', null);
  await app.register(cookie);

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${tileOrigin(config.mapTileUrl)}`.trim(),
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  app.addHook('onRequest', async (req, reply) => {
    reply.header('content-security-policy', csp);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'same-origin');
    reply.header('cross-origin-opener-policy', 'same-origin');
    reply.header('permissions-policy', 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()');
    if (config.cookieSecure) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');

    if (!req.url.startsWith('/api/')) return;
    reply.header('cache-control', 'no-store');

    // CSRF: browsers cannot add custom headers to cross-site requests without a CORS preflight,
    // which this server never approves. Also reject requests whose Origin is another site.
    if (MUTATING.has(req.method)) {
      if (req.headers['x-requested-with'] !== 'onsite') {
        return sendError(reply, new AppError(403, 'CSRF', 'Request blocked.'));
      }
      const origin = req.headers.origin;
      if (origin && req.headers.host && originHost(origin) !== req.headers.host) {
        return sendError(reply, new AppError(403, 'CSRF', 'Request blocked.'));
      }
    }

    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const loaded = loadSession(db, token);
      if (loaded) {
        const company = loaded.user.company_id
          ? ((db.prepare('SELECT * FROM companies WHERE id = ?').get(loaded.user.company_id) as CompanyRow | undefined) ?? null)
          : null;
        req.auth = { session: loaded.session, user: loaded.user, company };
        touchSession(db, loaded.session, loaded.user, req.ip);
      }
    }
  });

  app.addHook('onResponse', async (_req, reply) => {
    metrics.recordResponse(reply.statusCode);
  });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) return sendError(reply, err);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = first?.path.join('.');
      const message = first ? (field ? `${field}: ${first.message}` : first.message) : 'Invalid request.';
      return sendError(reply, new AppError(400, 'VALIDATION', message, { issues: err.issues.slice(0, 10) }));
    }
    const status = (err as FastifyError).statusCode;
    if (status && status >= 400 && status < 500) {
      const message = status === 413 ? 'The upload is too large.' : err.message;
      return sendError(reply, new AppError(status, (err as FastifyError).code ?? 'BAD_REQUEST', message));
    }
    req.log.error(err);
    systemLog(db, 'error', 'server', err.message, {
      stack: err.stack,
      method: req.method,
      url: req.url.split('?')[0],
      userId: req.auth?.user.id,
    });
    return sendError(reply, new AppError(500, 'SERVER_ERROR', 'Something went wrong on our side. Please try again.'));
  });

  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(workerRoutes);
  await app.register(managerRoutes);
  await app.register(devRoutes);

  const indexFile = path.join(config.webDir, 'index.html');
  const hasWeb = fs.existsSync(indexFile);
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      wildcard: false,
      index: false,
      setHeaders(reply, filePath) {
        const rel = path.relative(config.webDir, filePath);
        reply.header('cache-control', rel.startsWith(`assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }
  const indexHtml = hasWeb
    ? fs.readFileSync(indexFile, 'utf8').replaceAll('%APP_NAME%', config.appName.replace(/[<>&"]/g, ''))
    : null;

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET' || !indexHtml) {
      return sendError(reply, new AppError(404, 'NOT_FOUND', 'Not found.'));
    }
    // Single-page app: unknown paths render the app shell, which routes on the client.
    return reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(indexHtml);
  });

  app.addHook('onClose', async () => {
    jobs.stop();
    metrics.stop();
    if (!opts.db) db.close();
  });

  return app;
}
