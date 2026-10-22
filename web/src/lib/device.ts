import type {
  ClientEnvironment,
  DeviceFingerprint,
  DeviceRegistrationResult,
  SignedEnvelope,
} from '../../../shared/types';
import { post } from './api';
import { t } from './i18n';

// Each browser holds one ECDSA P-256 key, generated as NON-EXTRACTABLE: scripts can use it to sign but can
// never read or copy it. The server binds the public half to one worker, so a password alone does not let
// anyone check in from another phone.

const DB_NAME = 'onsite-device';
const STORE = 'keys';
const RECORD = 'device';

interface StoredKey {
  keyPair: CryptoKeyPair;
  publicJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  keyId: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** RFC 7638 thumbprint — must match the server's computation. */
async function thumbprint(jwk: StoredKey['publicJwk']): Promise<string> {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
}

let cached: StoredKey | null = null;

export function cryptoSupported(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';
}

export async function getDeviceKey(): Promise<StoredKey | null> {
  if (cached) return cached;
  try {
    cached = (await withStore<StoredKey | undefined>('readonly', (s) => s.get(RECORD))) ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function createDeviceKey(): Promise<StoredKey> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicJwk = { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x!, y: jwk.y! };
  const record: StoredKey = { keyPair, publicJwk, keyId: await thumbprint(publicJwk), createdAt: Date.now() };
  await withStore('readwrite', (s) => s.put(record, RECORD));
  cached = record;
  // Ask the browser not to evict this storage, so the phone does not need approving again.
  void navigator.storage?.persist?.().catch(() => undefined);
  return record;
}

export async function ensureDeviceKey(): Promise<StoredKey> {
  return (await getDeviceKey()) ?? createDeviceKey();
}

export async function signPayload(payload: object): Promise<SignedEnvelope> {
  const key = await getDeviceKey();
  if (!key) throw new Error(t('worker.device.noKey'));
  const text = JSON.stringify(payload);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.keyPair.privateKey, new TextEncoder().encode(text));
  return { keyId: key.keyId, payload: text, signature: b64url(signature) };
}

function gpuName(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 200);
  } catch {
    return '';
  }
}

interface UaData {
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
}
const uaData = () => (navigator as Navigator & { userAgentData?: UaData }).userAgentData;

export async function collectFingerprint(): Promise<DeviceFingerprint> {
  let model = '';
  try {
    model = (await uaData()?.getHighEntropyValues?.(['model']))?.model ?? '';
  } catch {
    model = '';
  }
  return {
    ua: navigator.userAgent.slice(0, 500),
    platform: (navigator.platform || '').slice(0, 100),
    model: model.slice(0, 100),
    languages: (navigator.languages ?? [navigator.language]).join(',').slice(0, 200),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    screen: `${screen.width}x${screen.height}`,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    cores: navigator.hardwareConcurrency || 0,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    touch: navigator.maxTouchPoints || 0,
    gpu: gpuName(),
  };
}

const isNative = (fn: unknown) =>
  typeof fn === 'function' && /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));

/** Tells the server whether the browser's location feature looks original (not replaced by a script). */
function geolocationLooksNative(): boolean {
  try {
    const geo = navigator.geolocation;
    if (!geo || typeof Geolocation === 'undefined' || !(geo instanceof Geolocation)) return false;
    const proto = Geolocation.prototype;
    return (
      geo.getCurrentPosition === proto.getCurrentPosition &&
      geo.watchPosition === proto.watchPosition &&
      !Object.prototype.hasOwnProperty.call(geo, 'getCurrentPosition') &&
      !Object.prototype.hasOwnProperty.call(geo, 'watchPosition') &&
      isNative(proto.getCurrentPosition) &&
      isNative(proto.watchPosition) &&
      isNative(Function.prototype.toString)
    );
  } catch {
    return false;
  }
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function clientEnvironment(): ClientEnvironment {
  return {
    webdriver: navigator.webdriver === true,
    geoNative: geolocationLooksNative(),
    touchPoints: navigator.maxTouchPoints || 0,
    platform: (navigator.platform || '').slice(0, 100),
    standalone: isStandalone(),
    mobileHint: typeof uaData()?.mobile === 'boolean' ? uaData()!.mobile! : null,
    screen: `${screen.width}x${screen.height}`,
  };
}

/** Registers this browser's key for the signed-in worker (creating the key if needed). */
export async function registerThisDevice(note = '', fresh = false): Promise<DeviceRegistrationResult> {
  const key = fresh ? await createDeviceKey() : await ensureDeviceKey();
  const { nonce } = await post<{ nonce: string }>('/api/device/challenge');
  const fingerprint = await collectFingerprint();
  const envelope = await signPayload({ v: 1, nonce, publicKey: key.publicJwk, fingerprint, note });
  return post<DeviceRegistrationResult>('/api/device/register', envelope);
}
