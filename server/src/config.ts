import path from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  dataDir: string;
  /** SQLite file path, or ':memory:' for tests. */
  dbFile: string;
  appName: string;
  version: string;
  /** Fastify trustProxy setting. Only enable behind a reverse proxy that rewrites X-Forwarded-For. */
  trustProxy: boolean | number | string;
  cookieSecure: boolean;
  /** Directory with the built web app (index.html, assets/). */
  webDir: string;
  mapTileUrl: string;
  mapAttribution: string;
  geocoderUrl: string;
  contactEmail: string;
  bootstrapDeveloper: { username: string; password: string | null };
  /** Run background jobs on an interval (disabled in tests). */
  runJobs: boolean;
  /** VAPID subject for web push (mailto: or https: URL). */
  pushSubject: string;
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = (process.env.NODE_ENV as AppConfig['env']) ?? 'development';
  const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
  const contactEmail = process.env.CONTACT_EMAIL ?? 'admin@example.com';
  const base: AppConfig = {
    env: env === 'production' || env === 'test' ? env : 'development',
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir,
    dbFile: process.env.DB_FILE ?? path.join(dataDir, 'onsite.db'),
    appName: process.env.APP_NAME ?? 'OnSite',
    version: pkg.version,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : env === 'production',
    webDir: path.resolve(process.env.WEB_DIR ?? 'dist/web'),
    mapTileUrl: process.env.MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    mapAttribution:
      process.env.MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    geocoderUrl: process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org',
    contactEmail,
    bootstrapDeveloper: {
      username: process.env.BOOTSTRAP_DEV_USERNAME ?? 'developer',
      password: process.env.BOOTSTRAP_DEV_PASSWORD ?? null,
    },
    runJobs: env !== 'test',
    pushSubject: process.env.PUSH_SUBJECT ?? `mailto:${contactEmail}`,
  };
  return { ...base, ...overrides };
}
