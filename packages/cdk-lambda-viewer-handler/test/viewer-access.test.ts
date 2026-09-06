import { describe, expect, test } from 'vitest';

import { evaluateAccess, isIpAllowed, parseBasicAuth } from '../src/viewer-access.js';

const CREDENTIALS = { username: 'reader', password: 'correct horse' };

const basicHeader = (username: string, password: string): string => {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
};

describe('parseBasicAuth', () => {
  test('reads a well formed header', () => {
    expect(parseBasicAuth(basicHeader('reader', 'correct horse'))).toEqual(CREDENTIALS);
  });

  test('keeps colons that belong to the password', () => {
    expect(parseBasicAuth(basicHeader('reader', 'a:b:c'))?.password).toBe('a:b:c');
  });

  test('ignores anything that is not basic auth', () => {
    expect(parseBasicAuth(undefined)).toBeUndefined();
    expect(parseBasicAuth('Bearer token')).toBeUndefined();
    expect(parseBasicAuth('Basic bm9jb2xvbg==')).toBeUndefined();
  });
});

describe('isIpAllowed', () => {
  test('matches IPv4 ranges', () => {
    expect(isIpAllowed('203.0.113.9', ['203.0.113.0/24'])).toBe(true);
    expect(isIpAllowed('203.0.114.9', ['203.0.113.0/24'])).toBe(false);
    expect(isIpAllowed('203.0.113.9', ['203.0.113.9/32'])).toBe(true);
    expect(isIpAllowed('203.0.113.9', ['203.0.113.9'])).toBe(true);
    expect(isIpAllowed('10.1.2.3', ['0.0.0.0/0'])).toBe(true);
  });

  test('matches IPv6 ranges including compressed forms', () => {
    expect(isIpAllowed('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(isIpAllowed('2001:db9::1', ['2001:db8::/32'])).toBe(false);
    expect(isIpAllowed('::1', ['::1/128'])).toBe(true);
  });

  test('does not match across address families', () => {
    expect(isIpAllowed('203.0.113.9', ['2001:db8::/32'])).toBe(false);
    expect(isIpAllowed('2001:db8::1', ['203.0.113.0/24'])).toBe(false);
  });

  test('rejects malformed input rather than allowing it', () => {
    expect(isIpAllowed('not-an-ip', ['0.0.0.0/0'])).toBe(false);
    expect(isIpAllowed('203.0.113.300', ['0.0.0.0/0'])).toBe(false);
    expect(isIpAllowed('203.0.113.9', ['203.0.113.0/33'])).toBe(false);
    expect(isIpAllowed('203.0.113.9', ['garbage'])).toBe(false);
  });
});

describe('evaluateAccess', () => {
  test('allows a request when nothing is configured', () => {
    expect(evaluateAccess({
      sourceIp: '203.0.113.9',
      authorization: undefined,
      allowedCidrs: [],
      credentials: undefined,
    }).allowed).toBe(true);
  });

  test('rejects an address outside the allow list without prompting', () => {
    const decision = evaluateAccess({
      sourceIp: '198.51.100.4',
      authorization: basicHeader('reader', 'correct horse'),
      allowedCidrs: ['203.0.113.0/24'],
      credentials: CREDENTIALS,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.challenge).toBeUndefined();
  });

  test('rejects a request with no source address when a range is configured', () => {
    expect(evaluateAccess({
      sourceIp: undefined,
      authorization: undefined,
      allowedCidrs: ['203.0.113.0/24'],
      credentials: undefined,
    }).allowed).toBe(false);
  });

  test('challenges a caller that sent no credentials', () => {
    const decision = evaluateAccess({
      sourceIp: '203.0.113.9',
      authorization: undefined,
      allowedCidrs: [],
      credentials: CREDENTIALS,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.challenge).toBe(true);
  });

  test('rejects wrong credentials and accepts the right ones', () => {
    const wrong = evaluateAccess({
      sourceIp: '203.0.113.9',
      authorization: basicHeader('reader', 'wrong'),
      allowedCidrs: [],
      credentials: CREDENTIALS,
    });
    const right = evaluateAccess({
      sourceIp: '203.0.113.9',
      authorization: basicHeader('reader', 'correct horse'),
      allowedCidrs: [],
      credentials: CREDENTIALS,
    });

    expect(wrong.allowed).toBe(false);
    expect(wrong.challenge).toBe(true);
    expect(right.allowed).toBe(true);
  });

  test('requires both checks to pass when both are configured', () => {
    expect(evaluateAccess({
      sourceIp: '203.0.113.9',
      authorization: basicHeader('reader', 'correct horse'),
      allowedCidrs: ['203.0.113.0/24'],
      credentials: CREDENTIALS,
    }).allowed).toBe(true);
  });
});
