import { BlockList, isIP } from 'node:net';

/** Strips IPv4-mapped IPv6 prefixes so '::ffff:203.0.113.5' matches '203.0.113.5'. */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  return mapped ? mapped[1]! : trimmed;
}

/** Validates an IP address or CIDR range ('203.0.113.0/24', '2001:db8::/32'). */
export function isValidNetwork(entry: string): boolean {
  const [addr, bits, extra] = entry.trim().split('/');
  if (extra !== undefined || !addr) return false;
  const family = isIP(addr);
  if (!family) return false;
  if (bits === undefined) return true;
  if (!/^\d+$/.test(bits)) return false;
  const n = Number(bits);
  return family === 4 ? n >= 0 && n <= 32 : n >= 0 && n <= 128;
}

export function ipMatches(ip: string, networks: string[]): boolean {
  const address = normalizeIp(ip);
  const family = isIP(address);
  if (!family || networks.length === 0) return false;
  const list = new BlockList();
  for (const entry of networks) {
    if (!isValidNetwork(entry)) continue;
    const [addr, bits] = entry.trim().split('/') as [string, string | undefined];
    const type = isIP(addr) === 4 ? 'ipv4' : 'ipv6';
    if (bits === undefined) list.addAddress(addr, type);
    else list.addSubnet(addr, Number(bits), type);
  }
  return list.check(address, family === 4 ? 'ipv4' : 'ipv6');
}
