import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PublicConfig } from '../../../shared/types';
import { rateLimit } from '../http';
import { systemLog } from '../services/logs';

export default async function publicRoutes(app: FastifyInstance) {
  const { db, config, push } = app.ctx;

  app.get('/api/config', async (): Promise<PublicConfig> => ({
    appName: config.appName,
    version: config.version,
    mapTileUrl: config.mapTileUrl,
    mapAttribution: config.mapAttribution,
    pushPublicKey: push.publicKey,
  }));

  /** For uptime monitors (UptimeRobot, Better Stack, ...): 200 when the app and database work. */
  app.get('/healthz', async (_req, reply) => {
    try {
      db.prepare('SELECT 1').get();
      return { ok: true, version: config.version, uptimeSec: Math.round(process.uptime()) };
    } catch (err) {
      reply.status(503);
      return { ok: false, error: String((err as Error).message) };
    }
  });

  app.get('/manifest.webmanifest', async (_req, reply) => {
    reply.header('content-type', 'application/manifest+json').header('cache-control', 'no-cache');
    return {
      name: config.appName,
      short_name: config.appName,
      description: 'Check in and out at work with your phone.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f6f7f9',
      theme_color: '#0f766e',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
  });

  /** Browser-side errors, so problems on workers' phones show up in the developer console. */
  app.post('/api/client-log', async (req) => {
    rateLimit(req, `client-log:${req.ip}`, 20, 10 * 60_000);
    const body = z
      .object({
        message: z.string().max(2000),
        stack: z.string().max(8000).optional(),
        url: z.string().max(500).optional(),
        context: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    systemLog(db, 'error', 'browser', body.message, {
      stack: body.stack,
      url: body.url,
      context: body.context,
      userId: req.auth?.user.id,
      role: req.auth?.user.role,
      userAgent: req.headers['user-agent'],
    });
    return { ok: true };
  });
}
