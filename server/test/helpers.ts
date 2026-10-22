import { webcrypto } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ClientEnvironment, LocationSample, PunchPayload, SignedEnvelope } from '../../shared/types';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { jwkThumbprint, type EcPublicJwk } from '../src/lib/crypto';
import { hashPassword } from '../src/auth/password';
import { nowIso } from '../src/lib/time';

const subtle = webcrypto.subtle;

export async function makeApp(): Promise<FastifyInstance> {
  const config = loadConfig({
    env: 'test',
    dbFile: ':memory:',
    runJobs: false,
    webDir: '/nonexistent',
    cookieSecure: false,
    dataDir: '/tmp/onsite-test',
  });
  return buildApp(config);
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Record<string, unknown>;
}

/** Cookie-keeping HTTP client over fastify.inject, like a browser tab. */
export class Client {
  cookies = new Map<string, string>();
  constructor(
    readonly app: FastifyInstance,
    readonly userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ) {}

  async request<T = any>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const res = await this.app.inject({
      method: method as 'GET',
      url,
      payload: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'user-agent': this.userAgent,
        'x-requested-with': 'onsite',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      remoteAddress: headers['x-test-ip'] ?? '198.51.100.7',
    });
    for (const c of res.cookies) {
      if (c.value === '' || (c.maxAge !== undefined && c.maxAge <= 0)) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    let parsed: unknown = res.body;
    if ((res.headers['content-type'] ?? '').toString().includes('application/json')) parsed = res.json();
    return { status: res.statusCode, body: parsed as T, headers: res.headers };
  }

  get<T = any>(url: string, headers?: Record<string, string>) {
    return this.request<T>('GET', url, undefined, headers);
  }
  post<T = any>(url: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.request<T>('POST', url, body, headers);
  }
  patch<T = any>(url: string, body: unknown, headers?: Record<string, string>) {
    return this.request<T>('PATCH', url, body, headers);
  }
  delete<T = any>(url: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.request<T>('DELETE', url, body, headers);
  }

  async login(username: string, password: string) {
    const res = await this.post('/api/auth/login', { username, password });
    if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  }
}

/** A worker's phone: a non-extractable P-256 key, like the browser's WebCrypto key. */
export class FakePhone {
  private constructor(
    readonly keys: webcrypto.CryptoKeyPair,
    readonly jwk: EcPublicJwk,
    readonly keyId: string,
  ) {}

  static async create(): Promise<FakePhone> {
    const keys = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as webcrypto.CryptoKeyPair;
    const full = (await subtle.exportKey('jwk', keys.publicKey)) as EcPublicJwk;
    const jwk: EcPublicJwk = { kty: 'EC', crv: 'P-256', x: full.x, y: full.y };
    return new FakePhone(keys, jwk, jwkThumbprint(jwk));
  }

  async sign(payload: object): Promise<SignedEnvelope> {
    const text = JSON.stringify(payload);
    const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.keys.privateKey, new TextEncoder().encode(text));
    return { keyId: this.keyId, payload: text, signature: Buffer.from(sig).toString('base64url') };
  }

  /** Registers this phone for the signed-in worker. */
  async register(client: Client, note = '') {
    const ch = await client.post('/api/device/challenge');
    const envelope = await this.sign({
      v: 1,
      nonce: ch.body.nonce,
      publicKey: this.jwk,
      fingerprint: {
        ua: client.userAgent,
        platform: 'iPhone',
        model: '',
        languages: 'en-US',
        tz: 'Asia/Amman',
        screen: '390x844',
        dpr: 3,
        cores: 6,
        memory: null,
        touch: 5,
        gpu: 'Apple GPU',
      },
      note,
    });
    return client.post('/api/device/register', envelope);
  }
}

export const IPHONE_ENV: ClientEnvironment = {
  webdriver: false,
  geoNative: true,
  touchPoints: 5,
  platform: 'iPhone',
  standalone: true,
  mobileHint: null,
  screen: '390x844',
};

let jitterSeed = 1;
/** Realistic GPS readings around a point: several decimals, small jitter, typical accuracy. */
export function samplesAround(lat: number, lng: number, opts: { acc?: number; count?: number; ageMs?: number } = {}): LocationSample[] {
  const now = Date.now() - (opts.ageMs ?? 0);
  const count = opts.count ?? 4;
  return Array.from({ length: count }, (_, i) => {
    jitterSeed = (jitterSeed * 9301 + 49297) % 233280;
    const r = jitterSeed / 233280 - 0.5;
    return {
      lat: lat + r * 0.00004 + 0.0000012345 * (i + 1),
      lng: lng - r * 0.00004 + 0.0000023456 * (i + 1),
      acc: (opts.acc ?? 12) + i * 0.7,
      alt: 812.4 + r,
      altAcc: 9.5,
      heading: null,
      speed: 0,
      ts: now - (count - i) * 900,
    };
  });
}

export async function punch(
  client: Client,
  phone: FakePhone,
  type: 'in' | 'out',
  at: { lat: number; lng: number; acc?: number },
  extra: Partial<PunchPayload> = {},
) {
  const ch = await client.post('/api/punch/challenge', { type, keyId: phone.keyId });
  if (ch.status !== 200) return ch;
  const payload: PunchPayload = {
    v: 1,
    nonce: ch.body.nonce,
    type,
    samples: samplesAround(at.lat, at.lng, { acc: at.acc }),
    clientTime: Date.now(),
    tz: 'Asia/Amman',
    env: IPHONE_ENV,
    selfie: ch.body.requireSelfie ? fakeSelfie() : undefined,
    ...extra,
  };
  return client.post('/api/punch', await phone.sign(payload));
}

let selfieCounter = 0;
/** A small valid JPEG (unique each call so duplicate-photo checks do not fire). */
export function fakeSelfie(): string {
  selfieCounter++;
  const bytes = Buffer.alloc(3000, 0x41);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes.writeUInt32BE(selfieCounter, 100);
  bytes.writeDoubleBE(Math.random(), 200);
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

export const SITE = { lat: 31.9539, lng: 35.9106 }; // Amman

export interface Seeded {
  dev: Client;
  companyId: number;
  siteId: number;
  site2Id: number;
  manager: { id: number; username: string; password: string };
  workers: Array<{ id: number; username: string; password: string; name: string }>;
}

/** Creates a company with two sites, one manager and three workers through the developer API. */
export async function seed(app: FastifyInstance, settings: Record<string, unknown> = {}): Promise<Seeded> {
  const db = app.ctx.db;
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (role, username, password_hash, full_name, created_at, updated_at)
     VALUES ('developer', 'owner', ?, 'Owner', ?, ?)`,
  ).run(await hashPassword('owner-pass-1'), now, now);
  const dev = new Client(app, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36');
  await dev.login('owner', 'owner-pass-1');
  const company = await dev.post('/api/dev/companies', { name: 'Acme Builders', timezone: 'Asia/Amman', settings });
  const companyId = company.body.id as number;
  const site = await dev.post('/api/dev/sites', { companyId, name: 'Main Yard', lat: SITE.lat, lng: SITE.lng, radiusM: 150 });
  const site2 = await dev.post('/api/dev/sites', { companyId, name: 'North Depot', lat: SITE.lat + 0.05, lng: SITE.lng, radiusM: 150 });
  const mgr = await dev.post('/api/dev/users', {
    role: 'manager',
    companyId,
    username: 'maria',
    fullName: 'Maria Manager',
    phone: '+962 79 000 0001',
    password: 'manager-pass-1',
  });
  const workers = [];
  for (const [i, name] of ['Ali Worker', 'Bea Worker', 'Carl Worker'].entries()) {
    const username = name.split(' ')[0]!.toLowerCase();
    const w = await dev.post('/api/dev/users', {
      role: 'worker',
      companyId,
      username,
      fullName: name,
      phone: `+962 79 000 01${i}`,
      password: `${username}-pass-1`,
    });
    workers.push({ id: w.body.user.id, username, password: `${username}-pass-1`, name });
  }
  return {
    dev,
    companyId,
    siteId: site.body.id,
    site2Id: site2.body.id,
    manager: { id: mgr.body.user.id, username: 'maria', password: 'manager-pass-1' },
    workers,
  };
}

/** Signed-in worker with an approved phone. */
export async function workerWithPhone(app: FastifyInstance, w: { username: string; password: string }) {
  const client = new Client(app);
  await client.login(w.username, w.password);
  const phone = await FakePhone.create();
  const reg = await phone.register(client);
  if (reg.body.status !== 'active') throw new Error(`phone not active: ${JSON.stringify(reg.body)}`);
  return { client, phone };
}

/** Moves a punch's time into the past so cooldowns and history behave as if time passed. */
export function backdatePunches(app: FastifyInstance, workerId: number, minutes: number) {
  const shift = (iso: string) => new Date(Date.parse(iso) - minutes * 60_000).toISOString();
  const db = app.ctx.db;
  for (const p of db.prepare('SELECT id, at FROM punches WHERE worker_id = ?').all(workerId) as Array<{ id: number; at: string }>) {
    db.prepare('UPDATE punches SET at = ?, created_at = ? WHERE id = ?').run(shift(p.at), shift(p.at), p.id);
  }
  for (const e of db.prepare('SELECT id, clock_in_at, clock_out_at FROM time_entries WHERE worker_id = ?').all(workerId) as Array<{
    id: number;
    clock_in_at: string;
    clock_out_at: string | null;
  }>) {
    db.prepare('UPDATE time_entries SET clock_in_at = ?, clock_out_at = ? WHERE id = ?').run(
      shift(e.clock_in_at),
      e.clock_out_at ? shift(e.clock_out_at) : null,
      e.id,
    );
  }
}
