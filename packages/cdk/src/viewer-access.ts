import { createHash, timingSafeEqual } from 'node:crypto';

/** @internal */
export interface ViewerCredentials {
  readonly username: string;
  readonly password: string;
}

/** @internal */
export interface AccessDecision {
  readonly allowed: boolean;
  /** Set when the caller should be asked for credentials. */
  readonly challenge?: boolean;
  readonly reason?: string;
}

const ALLOWED = { allowed: true } as const;

/**
 * Decides whether a request may read captured mail.
 *
 * A Lambda function URL that a browser can open is unauthenticated at the AWS
 * layer, so the checks have to happen here. Both are optional individually but
 * the construct refuses to create an open viewer without one of them.
 */
export function evaluateAccess(options: {
  readonly sourceIp: string | undefined;
  readonly authorization: string | undefined;
  readonly allowedCidrs: readonly string[];
  readonly credentials: ViewerCredentials | undefined;
}): AccessDecision {
  if (options.allowedCidrs.length > 0) {
    if (options.sourceIp === undefined) {
      return { allowed: false, reason: 'Source address unavailable' };
    }
    if (!isIpAllowed(options.sourceIp, options.allowedCidrs)) {
      return { allowed: false, reason: 'Address not allowed' };
    }
  }

  if (options.credentials === undefined) {
    return ALLOWED;
  }

  const provided = parseBasicAuth(options.authorization);
  if (provided === undefined) {
    return { allowed: false, challenge: true, reason: 'Authentication required' };
  }
  if (!matchesCredentials(provided, options.credentials)) {
    return { allowed: false, challenge: true, reason: 'Invalid credentials' };
  }
  return ALLOWED;
}

/** @internal */
export function parseBasicAuth(header: string | undefined): ViewerCredentials | undefined {
  if (header === undefined) {
    return undefined;
  }
  const match = /^basic\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return undefined;
  }

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) {
    return undefined;
  }
  return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * Compares credentials without leaking their length or content through timing.
 * Hashing first keeps the compared buffers the same size whatever was sent.
 */
function matchesCredentials(provided: ViewerCredentials, expected: ViewerCredentials): boolean {
  return equalSecret(provided.username, expected.username)
    && equalSecret(provided.password, expected.password);
}

function equalSecret(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** @internal */
export function isIpAllowed(address: string, cidrs: readonly string[]): boolean {
  const parsed = parseAddress(address);
  if (parsed === undefined) {
    return false;
  }

  return cidrs.some((cidr) => {
    const range = parseCidr(cidr);
    if (range === undefined || range.bits !== parsed.bits) {
      return false;
    }
    const mask = maskFor(range.prefix, range.bits);
    return (parsed.value & mask) === (range.value & mask);
  });
}

interface ParsedAddress {
  readonly value: bigint;
  readonly bits: 32 | 128;
}

interface ParsedCidr extends ParsedAddress {
  readonly prefix: number;
}

function parseCidr(cidr: string): ParsedCidr | undefined {
  const [address, prefixText] = cidr.split('/');
  const parsed = parseAddress(address ?? '');
  if (parsed === undefined) {
    return undefined;
  }

  const prefix = prefixText === undefined ? parsed.bits : Number.parseInt(prefixText, 10);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > parsed.bits) {
    return undefined;
  }
  return { ...parsed, prefix };
}

function parseAddress(address: string): ParsedAddress | undefined {
  return address.includes(':') ? parseIpV6(address) : parseIpV4(address);
}

function parseIpV4(address: string): ParsedAddress | undefined {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return undefined;
  }

  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined;
    }
    const octet = Number.parseInt(part, 10);
    if (octet > 255) {
      return undefined;
    }
    value = (value << 8n) | BigInt(octet);
  }
  return { value, bits: 32 };
}

function parseIpV6(address: string): ParsedAddress | undefined {
  const [head, tail, ...rest] = address.split('::');
  if (rest.length > 0) {
    return undefined;
  }

  const headGroups = expandGroups(head);
  const tailGroups = tail === undefined ? [] : expandGroups(tail);
  if (headGroups === undefined || tailGroups === undefined) {
    return undefined;
  }

  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? missing !== 0 : missing < 0) {
    return undefined;
  }

  const groups = [...headGroups, ...Array.from({ length: Math.max(missing, 0) }, () => 0), ...tailGroups];
  let value = 0n;
  for (const group of groups) {
    value = (value << 16n) | BigInt(group);
  }
  return { value, bits: 128 };
}

function expandGroups(segment: string): number[] | undefined {
  if (segment === '') {
    return [];
  }

  const groups: number[] = [];
  const parts = segment.split(':');
  for (const [index, part] of parts.entries()) {
    // A trailing IPv4 form such as ::ffff:203.0.113.7 occupies two groups.
    if (part.includes('.')) {
      if (index !== parts.length - 1) {
        return undefined;
      }
      const mapped = parseIpV4(part);
      if (mapped === undefined) {
        return undefined;
      }
      groups.push(Number(mapped.value >> 16n), Number(mapped.value & 0xffffn));
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      return undefined;
    }
    groups.push(Number.parseInt(part, 16));
  }
  return groups.length > 8 ? undefined : groups;
}

function maskFor(prefix: number, bits: number): bigint {
  const suffix = BigInt(bits - prefix);
  return ((1n << BigInt(bits)) - 1n) >> suffix << suffix;
}
