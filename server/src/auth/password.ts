import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { tr } from '../i18n';

// OWASP-recommended scrypt parameters (N=2^15, r=8, p=3). Tests use a cheaper cost.
const COST = process.env.ONSITE_FAST_HASH === '1' ? { N: 2 ** 10, r: 8, p: 1 } : { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const maxmem = (N: number, r: number) => 256 * N * r;

export async function hashPassword(password: string): Promise<string> {
  const { N, r, p } = COST;
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r, p, maxmem: maxmem(N, r) });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const key = await scryptAsync(password, salt, expected.length, { N, r, p, maxmem: maxmem(N, r) });
  return timingSafeEqual(key, expected);
}

/** A hash that never verifies, used to keep login timing constant for unknown usernames. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', '11111111', '00000000',
  'qwertyui', 'qwerty123', 'iloveyou', 'abcd1234', 'abc12345', 'letmein1', 'welcome1', 'admin123',
  '87654321', '12341234', 'aaaaaaaa', 'passw0rd',
]);

/** Returns a problem description, or null when the password is acceptable. */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < 8) return tr('Use at least 8 characters.');
  if (password.length > 200) return tr('Use at most 200 characters.');
  if (COMMON.has(password.toLowerCase())) return tr('This password is too common.');
  if (password.toLowerCase() === username.toLowerCase()) return tr('The password cannot be the same as the username.');
  if (/^(.)\1+$/.test(password)) return tr('Do not repeat a single character.');
  return null;
}
