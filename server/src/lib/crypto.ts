import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

export const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Unambiguous lowercase alphabet for passwords people type on phones (no 0/o, 1/l/i). */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Generates a password like `k7mp-x4rt-9qwe` (~59 bits). */
export function generatePassword(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += PASSWORD_ALPHABET[bytes[i]! % PASSWORD_ALPHABET.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

export interface EcPublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export function isEcPublicJwk(value: unknown): value is EcPublicJwk {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.kty === 'EC' &&
    v.crv === 'P-256' &&
    typeof v.x === 'string' &&
    typeof v.y === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(v.x) &&
    /^[A-Za-z0-9_-]{43}$/.test(v.y) &&
    !('d' in v)
  );
}

/** RFC 7638 JWK thumbprint, used as the stable id of a device key. */
export function jwkThumbprint(jwk: EcPublicJwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return createHash('sha256').update(canonical).digest('base64url');
}

/** Verifies a WebCrypto ECDSA P-256/SHA-256 signature (raw r||s encoding) over a UTF-8 string. */
export function verifyDeviceSignature(jwk: EcPublicJwk, data: string, signatureB64Url: string): boolean {
  try {
    const key = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
    const signature = Buffer.from(signatureB64Url, 'base64url');
    if (signature.length !== 64) return false;
    return verify('sha256', Buffer.from(data, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    return false;
  }
}
