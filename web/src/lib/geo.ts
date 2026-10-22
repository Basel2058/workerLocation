import type { LocationSample } from '../../../shared/types';
import { t } from './i18n';

export type GeoFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'insecure';

export class GeoError extends Error {
  constructor(readonly kind: GeoFailure) {
    super(kind);
  }
}

export interface SampleOptions {
  onProgress?: (best: LocationSample | null, count: number) => void;
  signal?: AbortSignal;
  /** Keep listening at least this long to see the GPS settle. */
  minMs?: number;
  /** Give up after this long. */
  maxMs?: number;
  /** Accuracy (m) that is good enough to stop early. */
  goodAccuracy?: number;
}

const toSample = (p: GeolocationPosition): LocationSample => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  acc: p.coords.accuracy,
  alt: p.coords.altitude,
  altAcc: p.coords.altitudeAccuracy,
  heading: p.coords.heading,
  speed: p.coords.speed,
  ts: p.timestamp,
});

export const bestOf = (samples: LocationSample[]) =>
  samples.reduce<LocationSample | null>((a, b) => (!a || b.acc < a.acc ? b : a), null);

/**
 * Collects several fresh GPS readings. More than one reading lets the server tell real GPS (which always
 * moves a little) from fake-location apps, and lets accuracy improve for a few seconds.
 */
export function collectSamples(opts: SampleOptions = {}): Promise<LocationSample[]> {
  const minMs = opts.minMs ?? 3000;
  const maxMs = opts.maxMs ?? 15000;
  const good = opts.goodAccuracy ?? 25;
  if (!window.isSecureContext) return Promise.reject(new GeoError('insecure'));
  if (!('geolocation' in navigator)) return Promise.reject(new GeoError('unsupported'));

  return new Promise((resolve, reject) => {
    const samples: LocationSample[] = [];
    const started = Date.now();
    let lastError: GeoFailure | null = null;
    let done = false;
    let watchId = 0;
    const finish = (err?: GeoError) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (err && samples.length === 0) reject(err);
      else resolve(samples);
    };
    const onAbort = () => finish(new GeoError('timeout'));
    opts.signal?.addEventListener('abort', onAbort);

    const check = () => {
      const elapsed = Date.now() - started;
      const best = bestOf(samples);
      if (!best) {
        if (elapsed >= maxMs) finish(new GeoError(lastError ?? 'timeout'));
        return;
      }
      if (elapsed >= minMs && samples.length >= 3 && best.acc <= good) return finish();
      if (elapsed >= 6000 && best.acc <= good * 2) return finish();
      if (elapsed >= maxMs) finish();
    };
    const timer = setInterval(check, 250);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        samples.push(toSample(pos));
        opts.onProgress?.(bestOf(samples), samples.length);
        check();
      },
      (err) => {
        // The watch keeps trying after transient errors; the timer decides when to give up.
        if (err.code === err.PERMISSION_DENIED) finish(new GeoError('denied'));
        else lastError = err.code === err.POSITION_UNAVAILABLE ? 'unavailable' : 'timeout';
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
  });
}

export async function permissionState(name: 'geolocation' | 'camera'): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/** What to tell the worker when the location could not be read, in the app's language. */
export function geoFailureText(kind: GeoFailure): { title: string; body: string } {
  return { title: t(`worker.geo.${kind}.title`), body: t(`worker.geo.${kind}.body`) };
}
