/**
 * SSRF protection — validates URLs before making outbound HTTP requests.
 * Resolves hostnames to IPs and blocks private/reserved address ranges.
 */

import dns from 'node:dns';

/** Private and reserved IPv4/IPv6 ranges that must not be reached by connectors. */
const BLOCKED_IPV4_RANGES: Array<{ network: number; mask: number }> = [
  { network: ip4ToInt('10.0.0.0'), mask: 0xff000000 },       // 10.0.0.0/8
  { network: ip4ToInt('172.16.0.0'), mask: 0xfff00000 },     // 172.16.0.0/12
  { network: ip4ToInt('192.168.0.0'), mask: 0xffff0000 },    // 192.168.0.0/16
  { network: ip4ToInt('169.254.0.0'), mask: 0xffff0000 },    // 169.254.0.0/16
  { network: ip4ToInt('127.0.0.0'), mask: 0xff000000 },      // 127.0.0.0/8
];

function ip4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const addr = ip4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(({ network, mask }) => (addr & mask) === network);
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  // fc00::/7 — unique local addresses
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // fe80::/10 — link-local addresses
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  return false;
}

/**
 * Validates a URL for SSRF safety. Blocks private IP ranges, localhost,
 * and non-HTTP schemes. Resolves the hostname via DNS before checking.
 *
 * @throws Error if the URL is blocked
 */
export async function validateUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow http and https schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme "${parsed.protocol}" — only http: and https: are allowed`);
  }

  const hostname = parsed.hostname;

  // Resolve hostname to IP address
  let address: string;
  let family: number;
  try {
    const result = await dns.promises.lookup(hostname);
    address = result.address;
    family = result.family;
  } catch {
    throw new Error(`DNS resolution failed for hostname "${hostname}"`);
  }

  if (family === 4 && isBlockedIPv4(address)) {
    throw new Error(
      `Blocked request to private/reserved IP ${address} (resolved from "${hostname}")`
    );
  }

  if (family === 6 && isBlockedIPv6(address)) {
    throw new Error(
      `Blocked request to private/reserved IPv6 address ${address} (resolved from "${hostname}")`
    );
  }
}
