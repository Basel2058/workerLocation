import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANY_SETTINGS } from '../../shared/types';
import { evaluateRisk, type RiskInput, type RiskSite } from '../src/services/risk';
import { IPHONE_ENV, samplesAround, SITE } from './helpers';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const main: RiskSite = { id: 1, name: 'Main Yard', lat: SITE.lat, lng: SITE.lng, radius_m: 150, networks: [], require_network: false };
const depot: RiskSite = { id: 2, name: 'North Depot', lat: SITE.lat + 0.05, lng: SITE.lng, radius_m: 150, networks: [], require_network: false };

function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    kind: 'in',
    nowMs: Date.now(),
    samples: samplesAround(SITE.lat + 0.0003, SITE.lng + 0.0002),
    clientTime: Date.now(),
    env: IPHONE_ENV,
    userAgent: IPHONE_UA,
    ip: '198.51.100.7',
    settings: DEFAULT_COMPANY_SETTINGS,
    sites: [main, depot],
    targetSiteId: 1,
    previous: null,
    othersToday: [],
    ownEarlier: [],
    recentRejections: 0,
    deviceApprovedAtMs: null,
    selfieDuplicate: false,
    request: false,
    unscheduled: false,
    ...overrides,
  };
}

describe('evaluateRisk', () => {
  it('accepts an honest check-in inside the workplace', () => {
    const r = evaluateRisk(input());
    expect(r.result).toBe('accepted');
    expect(r.site?.id).toBe(1);
    expect(r.flags).toEqual([]);
    expect(r.distanceM).toBeLessThan(150);
  });

  it('rejects a check-in from outside the workplace and reports the distance', () => {
    const r = evaluateRisk(input({ samples: samplesAround(SITE.lat + 0.01, SITE.lng) }));
    expect(r.result).toBe('rejected');
    expect(r.reason).toBe('OUTSIDE_GEOFENCE');
    expect(r.distanceM).toBeGreaterThan(1000);
  });

  it('turns an outside punch into a review when the worker asks the manager', () => {
    const r = evaluateRisk(input({ samples: samplesAround(SITE.lat + 0.01, SITE.lng), request: true }));
    expect(r.result).toBe('review');
    expect(r.reason).toBe('OFF_SITE_REQUEST');
    expect(r.flags).toContain('OFF_SITE_REQUEST');
  });

  it('never accepts a presence check from outside, even as a request', () => {
    const r = evaluateRisk(input({ kind: 'check', samples: samplesAround(SITE.lat + 0.01, SITE.lng), request: true }));
    expect(r.result).toBe('rejected');
  });

  it('rejects imprecise GPS but accepts it on the workplace network', () => {
    const vague = samplesAround(SITE.lat, SITE.lng + 0.001, { acc: 400 });
    expect(evaluateRisk(input({ samples: vague })).reason).toBe('LOW_ACCURACY');
    const onWifi = evaluateRisk(
      input({ samples: vague, ip: '203.0.113.20', sites: [{ ...main, networks: ['203.0.113.0/24'] }, depot] }),
    );
    expect(onWifi.result).toBe('accepted');
    expect(onWifi.networkMatch).toBe(true);
  });

  it('requires the workplace network when the site demands it', () => {
    const sites = [{ ...main, networks: ['203.0.113.5'], require_network: true }, depot];
    expect(evaluateRisk(input({ sites })).reason).toBe('NETWORK_REQUIRED');
    expect(evaluateRisk(input({ sites, ip: '::ffff:203.0.113.5' })).result).toBe('accepted');
  });

  it('rejects stale locations', () => {
    const r = evaluateRisk(input({ samples: samplesAround(SITE.lat, SITE.lng, { ageMs: 5 * 60_000 }) }));
    expect(r.reason).toBe('STALE_LOCATION');
  });

  it('flags fake-GPS patterns and sends them for review', () => {
    const t = Date.now();
    const frozen = [0, 1, 2, 3].map((i) => ({ lat: SITE.lat, lng: SITE.lng, acc: 0, ts: t - 4000 + i * 1000 }));
    const r = evaluateRisk(input({ samples: frozen }));
    expect(r.flags).toEqual(expect.arrayContaining(['ACCURACY_ZERO', 'NO_JITTER', 'ROUND_COORDINATES', 'MATCHES_SITE_CENTER']));
    expect(r.result).toBe('review');
    expect(r.reason).toBe('HIGH_RISK');
  });

  it('rejects high-risk punches when the company prefers that', () => {
    const t = Date.now();
    const frozen = [0, 1, 2].map((i) => ({ lat: SITE.lat, lng: SITE.lng, acc: 0, ts: t - 3000 + i * 1000 }));
    const r = evaluateRisk(input({ samples: frozen, settings: { ...DEFAULT_COMPANY_SETTINGS, highRiskAction: 'reject' } }));
    expect(r.result).toBe('rejected');
    expect(r.reason).toBe('HIGH_RISK');
  });

  it('does not punish a single weak signal', () => {
    const r = evaluateRisk(input({ env: { ...IPHONE_ENV }, recentRejections: 3 }));
    expect(r.flags).toContain('RAPID_RETRIES');
    expect(r.result).toBe('accepted');
  });

  it('detects a computer pretending to be an iPhone', () => {
    const r = evaluateRisk(input({ env: { ...IPHONE_ENV, platform: 'Win32', touchPoints: 0 } }));
    expect(r.flags).toContain('EMULATED_DEVICE');
    expect(r.result).toBe('review');
  });

  it('detects a replaced geolocation API and automation', () => {
    const r = evaluateRisk(input({ env: { ...IPHONE_ENV, geoNative: false, webdriver: true } }));
    expect(r.flags).toEqual(expect.arrayContaining(['API_TAMPERED', 'AUTOMATION']));
    expect(r.result).toBe('review');
  });

  it('flags impossible travel since the previous location', () => {
    const r = evaluateRisk(input({ previous: { lat: SITE.lat + 0.9, lng: SITE.lng, atMs: Date.now() - 5 * 60_000 } }));
    expect(r.flags).toContain('IMPOSSIBLE_TRAVEL');
  });

  it('flags coordinates identical to a coworker today', () => {
    const samples = samplesAround(SITE.lat + 0.0002, SITE.lng);
    const best = samples.reduce((a, b) => (b.acc < a.acc ? b : a));
    const r = evaluateRisk(input({ samples, othersToday: [{ lat: best.lat, lng: best.lng }] }));
    expect(r.flags).toContain('DUPLICATE_POSITION');
  });

  it('accepts a check-in at another company site but notes it', () => {
    const r = evaluateRisk(input({ samples: samplesAround(depot.lat + 0.0002, depot.lng) }));
    expect(r.result).toBe('accepted');
    expect(r.site?.id).toBe(2);
    expect(r.flags).toContain('DIFFERENT_SITE');
  });

  it('marks unscheduled check-ins and reviews them when configured', () => {
    expect(evaluateRisk(input({ unscheduled: true, targetSiteId: null })).flags).toContain('UNSCHEDULED');
    const r = evaluateRisk(
      input({ unscheduled: true, targetSiteId: null, settings: { ...DEFAULT_COMPANY_SETTINGS, reviewUnscheduled: true } }),
    );
    expect(r.result).toBe('review');
    expect(r.reason).toBe('UNSCHEDULED');
  });

  it('flags a computer used to punch', () => {
    const r = evaluateRisk(
      input({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
        env: { ...IPHONE_ENV, platform: 'Win32', touchPoints: 0 },
      }),
    );
    expect(r.flags).toContain('DESKTOP_DEVICE');
    expect(r.flags).not.toContain('EMULATED_DEVICE');
  });

  it('treats iPadOS reporting a Mac user agent as a real tablet', () => {
    const r = evaluateRisk(
      input({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        env: { ...IPHONE_ENV, platform: 'MacIntel', touchPoints: 5 },
      }),
    );
    expect(r.flags).not.toContain('DESKTOP_DEVICE');
    expect(r.flags).not.toContain('EMULATED_DEVICE');
    expect(r.result).toBe('accepted');
  });
});
