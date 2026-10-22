import { describe, expect, it } from 'vitest';
import { distanceMeters } from '../../shared/geo';
import { currentStep, totpCode, verifyTotp, base32Decode, base32Encode } from '../src/auth/totp';
import { ipMatches, isValidNetwork } from '../src/lib/ip';
import { RateLimiter } from '../src/lib/rate-limit';
import { dayRange, localDateTimeToUtc, localTime, zonedToUtc } from '../src/lib/time';
import { shiftRange } from '../src/services/shifts';
import { deviceLabel } from '../src/services/devices';

describe('time zones', () => {
  it('converts local wall-clock time to UTC, including DST', () => {
    expect(zonedToUtc('2026-01-15', '08:00', 'Europe/Berlin')).toBe('2026-01-15T07:00:00.000Z');
    expect(zonedToUtc('2026-07-15', '08:00', 'Europe/Berlin')).toBe('2026-07-15T06:00:00.000Z');
    expect(localTime('2026-07-15T06:00:00.000Z', 'Europe/Berlin')).toBe('08:00');
  });

  it('handles overnight shifts', () => {
    const r = shiftRange('2026-03-10', '22:00', '06:00', 'Asia/Amman');
    expect(r.startsAt).toBe('2026-03-10T19:00:00.000Z');
    expect(r.endsAt).toBe('2026-03-11T03:00:00.000Z');
  });

  it('computes local day ranges', () => {
    expect(dayRange('2026-10-22', 'America/New_York')).toEqual({
      start: '2026-10-22T04:00:00.000Z',
      end: '2026-10-23T04:00:00.000Z',
    });
  });

  it('parses datetime-local values', () => {
    expect(localDateTimeToUtc('2026-10-22T09:30', 'Asia/Amman')).toBe('2026-10-22T06:30:00.000Z');
    expect(localDateTimeToUtc('nonsense', 'Asia/Amman')).toBeNull();
  });
});

describe('geo', () => {
  it('measures distances accurately', () => {
    const d = distanceMeters({ lat: 31.9539, lng: 35.9106 }, { lat: 31.9539 + 0.001, lng: 35.9106 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('networks', () => {
  it('matches IPs and CIDR ranges', () => {
    expect(ipMatches('203.0.113.9', ['203.0.113.0/24'])).toBe(true);
    expect(ipMatches('::ffff:203.0.113.9', ['203.0.113.9'])).toBe(true);
    expect(ipMatches('198.51.100.1', ['203.0.113.0/24'])).toBe(false);
    expect(ipMatches('2001:db8::5', ['2001:db8::/32'])).toBe(true);
    expect(isValidNetwork('10.0.0.0/33')).toBe(false);
    expect(isValidNetwork('hello')).toBe(false);
  });
});

describe('totp', () => {
  it('round-trips base32 and verifies codes once', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    // RFC 6238 test vector for T = 59 s (step 1) with SHA-1: 94287082 -> last 6 digits.
    expect(totpCode(secret, 1)).toBe('287082');
    const step = currentStep();
    const code = totpCode(secret, step);
    expect(verifyTotp(secret, code, null)).toBe(step);
    expect(verifyTotp(secret, code, step)).toBeNull();
  });
});

describe('rate limiter', () => {
  it('limits hits per window', () => {
    const rl = new RateLimiter();
    expect(rl.hit('k', 2, 1000, 0).allowed).toBe(true);
    expect(rl.hit('k', 2, 1000, 10).allowed).toBe(true);
    expect(rl.hit('k', 2, 1000, 20).allowed).toBe(false);
    expect(rl.hit('k', 2, 1000, 1500).allowed).toBe(true);
  });
});

describe('device labels', () => {
  it('names phones for managers', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(
      'iPhone · Safari',
    );
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36', 'SM-A525F')).toBe(
      'SM-A525F · Chrome',
    );
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) SamsungBrowser/25.0 Chrome/121 Mobile Safari/537.36')).toBe(
      'SAMSUNG SM-S918B · Samsung Internet',
    );
  });
});
