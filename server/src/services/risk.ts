import { distanceMeters, isValidLatLng, type LatLng } from '../../../shared/geo';
import type { ClientEnvironment, CompanySettings, LocationSample } from '../../../shared/types';
import { ipMatches } from '../lib/ip';

// Decides whether a check-in / check-out / presence confirmation is genuine.
//
// Hard rules reject a punch outright (outside the workplace, imprecise or stale GPS, wrong network).
// Soft signals add to a risk score; a high score sends the punch to the manager for review (or rejects
// it, per company setting). No single weak signal is enough on its own, so honest workers with
// unusual phones are not punished, while the combinations fake-GPS apps produce are caught.

export interface RiskSite {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  networks: string[];
  require_network: boolean;
}

export interface RiskInput {
  kind: 'in' | 'out' | 'check';
  nowMs: number;
  samples: LocationSample[];
  clientTime: number;
  env: ClientEnvironment;
  userAgent: string;
  ip: string;
  settings: CompanySettings;
  /** Active workplaces of the company. */
  sites: RiskSite[];
  /** The scheduled site (check-in) or the site of the open entry (check-out / presence). */
  targetSiteId: number | null;
  /** The worker's most recent known position (any punch), for impossible-travel checks. */
  previous: { lat: number; lng: number; atMs: number } | null;
  /** Positions of other workers' punches today. */
  othersToday: LatLng[];
  /** This worker's positions from earlier days. */
  ownEarlier: LatLng[];
  /** Rejected punches by this worker in the last 15 minutes. */
  recentRejections: number;
  deviceApprovedAtMs: number | null;
  selfieDuplicate: boolean;
  /** The worker explicitly asked the manager to accept a punch from outside the workplace. */
  request: boolean;
  unscheduled: boolean;
}

export interface RiskResult {
  result: 'accepted' | 'review' | 'rejected';
  reason: string | null;
  best: LocationSample | null;
  site: RiskSite | null;
  distanceM: number | null;
  networkMatch: boolean;
  flags: string[];
  score: number;
}

export const HIGH_RISK_SCORE = 50;

export const RISK_WEIGHTS: Record<string, number> = {
  ACCURACY_ZERO: 60,
  ACCURACY_TOO_PERFECT: 25,
  NO_JITTER: 15,
  ROUND_COORDINATES: 25,
  POSITION_JUMP: 20,
  MOVING_FAST: 10,
  AUTOMATION: 60,
  API_TAMPERED: 60,
  EMULATED_DEVICE: 50,
  DESKTOP_DEVICE: 35,
  IMPOSSIBLE_TRAVEL: 40,
  MATCHES_SITE_CENTER: 40,
  DUPLICATE_POSITION: 25,
  REPEATED_POSITION: 20,
  NETWORK_MISMATCH: 5,
  NETWORK_MATCH: -30,
  RAPID_RETRIES: 15,
  NEW_DEVICE: 5,
  SELFIE_DUPLICATE: 60,
  CLOCK_SKEW: 10,
  STALE_LOCATION: 0,
  DIFFERENT_SITE: 0,
  UNSCHEDULED: 0,
  OFF_SITE_REQUEST: 0,
};

const MAX_SAMPLE_AGE_MS = 60_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

function decimals(n: number): number {
  const s = String(n);
  if (s.includes('e')) return 10;
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

const samePoint = (a: LatLng, b: LatLng) => a.lat.toFixed(7) === b.lat.toFixed(7) && a.lng.toFixed(7) === b.lng.toFixed(7);

function deviceSignals(env: ClientEnvironment, ua: string): string[] {
  const flags: string[] = [];
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMacUa = /Macintosh/.test(ua);
  // iPadOS Safari reports a Mac user agent but has a touch screen.
  const ipadAsMac = isMacUa && env.touchPoints > 1;
  const mobileUa = isIos || isAndroid || /Mobi/.test(ua) || ipadAsMac;
  const platform = env.platform || '';

  if (env.webdriver) flags.push('AUTOMATION');
  if (!env.geoNative) flags.push('API_TAMPERED');

  let emulated = false;
  if (mobileUa && env.touchPoints === 0) emulated = true;
  if (isIos && platform && !/^iP(hone|ad|od)/.test(platform) && platform !== 'MacIntel') emulated = true;
  if (isIos && platform === 'MacIntel' && !/iPad/.test(ua)) emulated = true;
  if (isAndroid && /^(Win|Mac)|x86|i686/i.test(platform)) emulated = true;
  if (mobileUa && env.mobileHint === false && !ipadAsMac) emulated = true;
  if (emulated) flags.push('EMULATED_DEVICE');
  else if (!mobileUa) flags.push('DESKTOP_DEVICE');
  return flags;
}

export function evaluateRisk(input: RiskInput): RiskResult {
  const flags: string[] = [];
  let score = 0;
  const flag = (code: string) => {
    if (flags.includes(code)) return;
    flags.push(code);
    score += RISK_WEIGHTS[code] ?? 0;
  };
  const reject = (reason: string, extra: Partial<RiskResult> = {}): RiskResult => ({
    result: 'rejected',
    reason,
    best: null,
    site: null,
    distanceM: null,
    networkMatch: false,
    flags,
    score,
    ...extra,
  });

  // Device and browser integrity — evaluated even if the location is unusable, so attempts are recorded.
  for (const f of deviceSignals(input.env, input.userAgent)) flag(f);
  if (Math.abs(input.clientTime - input.nowMs) > MAX_CLOCK_SKEW_MS) flag('CLOCK_SKEW');
  if (input.selfieDuplicate) flag('SELFIE_DUPLICATE');
  if (input.recentRejections >= 3) flag('RAPID_RETRIES');
  if (input.deviceApprovedAtMs !== null && input.nowMs - input.deviceApprovedAtMs < 86_400_000) flag('NEW_DEVICE');

  const valid = input.samples.filter((s) => isValidLatLng(s) && Number.isFinite(s.acc) && Number.isFinite(s.ts));
  if (valid.length === 0) return reject('NO_LOCATION');

  // Ages are measured on the phone's own clock, so a wrong phone clock does not matter here.
  const fresh = valid.filter((s) => input.clientTime - s.ts <= MAX_SAMPLE_AGE_MS && s.ts - input.clientTime <= 10_000);
  if (fresh.length === 0) {
    flag('STALE_LOCATION');
    return reject('STALE_LOCATION');
  }

  // GPS plausibility.
  if (fresh.some((s) => s.acc <= 0)) flag('ACCURACY_ZERO');
  const best = fresh.reduce((a, b) => (b.acc > 0 && (a.acc <= 0 || b.acc < a.acc) ? b : a));
  if (best.acc > 0 && best.acc < 1) flag('ACCURACY_TOO_PERFECT');

  const sorted = [...fresh].sort((a, b) => a.ts - b.ts);
  const distinctTimes = new Set(sorted.map((s) => s.ts)).size;
  if (sorted.length >= 3 && distinctTimes >= 3 && sorted[sorted.length - 1]!.ts - sorted[0]!.ts >= 2000) {
    const first = sorted[0]!;
    if (sorted.every((s) => s.lat === first.lat && s.lng === first.lng && s.acc === first.acc)) flag('NO_JITTER');
  }
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const dt = (b.ts - a.ts) / 1000;
    if (dt <= 10 && distanceMeters(a, b) > 2 * (a.acc + b.acc) + 100) {
      flag('POSITION_JUMP');
      break;
    }
  }
  if (decimals(best.lat) <= 4 && decimals(best.lng) <= 4) flag('ROUND_COORDINATES');
  if (fresh.some((s) => typeof s.speed === 'number' && s.speed > 15)) flag('MOVING_FAST');

  if (input.previous) {
    const d = distanceMeters(input.previous, best);
    const dt = (input.nowMs - input.previous.atMs) / 1000;
    if (d > 2000 && (dt <= 0 || d / dt > 70)) flag('IMPOSSIBLE_TRAVEL');
  }
  if (input.othersToday.some((p) => samePoint(p, best))) flag('DUPLICATE_POSITION');
  if (input.ownEarlier.some((p) => samePoint(p, best))) flag('REPEATED_POSITION');

  // Geofence.
  if (input.sites.length === 0) return reject('NO_SITES', { best });
  const measured = input.sites.map((site) => ({ site, d: distanceMeters(best, site) }));
  const target = input.targetSiteId ? measured.find((m) => m.site.id === input.targetSiteId) : undefined;
  const inside = measured.filter((m) => m.d <= m.site.radius_m).sort((a, b) => a.d - b.d);
  const nearest = [...measured].sort((a, b) => a.d - b.d)[0]!;

  let chosen = target && target.d <= target.site.radius_m ? target : inside[0];
  if (chosen && target && chosen !== target) flag('DIFFERENT_SITE');
  const candidate = chosen ?? target ?? nearest;
  const networkMatch = candidate.site.networks.length > 0 && ipMatches(input.ip, candidate.site.networks);

  // Indoors GPS drifts; being on the workplace internet proves presence when the fix is merely nearby.
  if (!chosen && networkMatch && candidate.d <= Math.max(500, 3 * candidate.site.radius_m)) chosen = candidate;

  if (candidate.site.networks.length > 0) flag(networkMatch ? 'NETWORK_MATCH' : 'NETWORK_MISMATCH');
  if (distanceMeters(best, candidate.site) < 0.5) flag('MATCHES_SITE_CENTER');

  const base = { best, site: candidate.site, distanceM: Math.round(candidate.d), networkMatch };

  let failure: string | null = null;
  if (best.acc > input.settings.maxAccuracyM && !networkMatch) failure = 'LOW_ACCURACY';
  else if (!chosen) failure = 'OUTSIDE_GEOFENCE';
  else if (candidate.site.require_network && !networkMatch) failure = 'NETWORK_REQUIRED';

  // A failed check can still reach the manager when the worker explicitly asks (e.g. sent to a client).
  let offSite = false;
  if (failure) {
    if (!input.request || input.kind === 'check') return reject(failure, base);
    offSite = true;
    flag('OFF_SITE_REQUEST');
  }
  if (input.unscheduled) flag('UNSCHEDULED');

  const outcome = (result: RiskResult['result'], reason: string | null): RiskResult => ({
    ...base,
    result,
    reason,
    flags,
    score: Math.max(0, score),
  });
  if (score >= HIGH_RISK_SCORE) {
    return outcome(input.settings.highRiskAction === 'reject' ? 'rejected' : 'review', 'HIGH_RISK');
  }
  if (offSite) return outcome('review', 'OFF_SITE_REQUEST');
  if (input.unscheduled && input.settings.reviewUnscheduled) return outcome('review', 'UNSCHEDULED');
  return outcome('accepted', null);
}
