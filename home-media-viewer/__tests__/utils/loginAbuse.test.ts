import type { NextApiRequest } from 'next';
import { loginClient, normalizeIP } from '@/utils/auth/loginClient';
import { LOGIN_DUMMY_HASH, verifyLoginPassword } from '@/utils/auth/loginProof';
import { loginWindow, retrySeconds, enterLogin, leaveLogin } from '@/utils/auth/loginLimiter';
import bcrypt from 'bcrypt';

const originalFlag = process.env.LOGIN_TRUST_FORWARDED_HEADERS;
const originalRanges = process.env.LOGIN_TRUSTED_PROXY_CIDRS;
const request = (peer: string | undefined, headers: Record<string, string | string[]> = {}) =>
  ({ socket: { remoteAddress: peer }, headers }) as unknown as NextApiRequest;
beforeEach(() => {
  delete process.env.LOGIN_TRUST_FORWARDED_HEADERS;
  delete process.env.LOGIN_TRUSTED_PROXY_CIDRS;
});
afterAll(() => {
  if (originalFlag === undefined) delete process.env.LOGIN_TRUST_FORWARDED_HEADERS;
  else process.env.LOGIN_TRUST_FORWARDED_HEADERS = originalFlag;
  if (originalRanges === undefined) delete process.env.LOGIN_TRUSTED_PROXY_CIDRS;
  else process.env.LOGIN_TRUSTED_PROXY_CIDRS = originalRanges;
});
const trust = (ranges = '127.0.0.1/32'): void => {
  process.env.LOGIN_TRUST_FORWARDED_HEADERS = 'true';
  process.env.LOGIN_TRUSTED_PROXY_CIDRS = ranges;
};
test.each([
  ['::ffff:192.0.2.1', '192.0.2.1'],
  ['::FFFF:c000:0201', '192.0.2.1'],
  ['2001:0db8::1', '2001:db8:0:0:0:0:0:1'],
  ['192.0.2.1', '192.0.2.1'],
  ['fe80::1%eth0', null],
  ['not-an-ip', null],
  ['192.000.2.1', null],
  [undefined, null],
])('normalizes peer %s', (ip, expected) => {
  expect(normalizeIP(ip)).toBe(expected);
});
test.each(['192.0.2.1', '198.51.100.9'])('ignores spoofed forwarded headers in direct mode %s', (forged) => {
  expect(loginClient(request('::ffff:127.0.0.1', { 'x-forwarded-for': forged, 'x-real-ip': forged }))).toBe(
    '127.0.0.1',
  );
});
test('aggregates IPv6 interface rotation within a /64', () => {
  expect(loginClient(request('2001:db8:abcd:1234::1'))).toBe('2001:db8:abcd:1234::/64');
  expect(loginClient(request('2001:db8:abcd:1234:ffff::9'))).toBe('2001:db8:abcd:1234::/64');
});
test('enabling forwarded headers still ignores an untrusted peer', () => {
  trust('10.0.0.0/8');
  expect(loginClient(request('192.0.2.8', { 'x-forwarded-for': '198.51.100.1' }))).toBe('192.0.2.8');
});
test('walks forwarding chain from trusted side and rejects client-supplied leftmost spoof', () => {
  trust('127.0.0.1/32,10.0.0.0/8');
  expect(loginClient(request('127.0.0.1', { 'x-forwarded-for': '203.0.113.99, 192.0.2.5, 10.2.3.4' }))).toBe(
    '192.0.2.5',
  );
});
test('supports an explicitly trusted IPv6 proxy and X-Real-IP fallback', () => {
  trust('2001:db8:1111::/48');
  expect(loginClient(request('2001:db8:1111::1', { 'x-real-ip': '192.0.2.5' }))).toBe('192.0.2.5');
});
test.each([
  '',
  'true',
  '::1/129',
  '192.0.2.1/33',
  'localhost',
  '192.0.2.1/1/2',
  '192.0.2.1/',
  '10.0.0.0/8,',
  '10.0.0.0/1e1',
  '10.0.0.0/+1',
])('rejects unsafe proxy configuration %s', (ranges) => {
  trust(ranges);
  expect(() => loginClient(request('127.0.0.1'))).toThrow();
});
test('invalid forwarding switch fails closed', () => {
  process.env.LOGIN_TRUST_FORWARDED_HEADERS = 'yes';
  expect(() => loginClient(request('127.0.0.1'))).toThrow();
});
test.each(['', 'unknown', '192.0.2.1, unknown', Array(17).fill('192.0.2.1').join(','), ['192.0.2.1']])(
  'uses conservative shared identity for malformed trusted forwarding (%#)',
  (header) => {
    trust();
    expect(loginClient(request('127.0.0.1', { 'x-forwarded-for': header }))).toBe('unknown');
  },
);
test('missing socket identity uses one conservative budget', () => {
  expect(loginClient(request(undefined))).toBe('unknown');
});
test('window resets at the boundary without extending blocked windows', () => {
  const now = new Date(100000);
  const current = { key: 'key', used: 5, startedAt: new Date(0), resetAt: new Date(100001) };
  expect(loginWindow(current, now, 60)).toEqual(current);
  expect(loginWindow(current, current.resetAt, 60)).toEqual({
    used: 0,
    startedAt: current.resetAt,
    resetAt: new Date(160001),
  });
  expect(retrySeconds(current.resetAt, now)).toBe(1);
  expect(retrySeconds(new Date(9999999), now)).toBe(300);
});
test('local requests never queue or exceed two admissions and recover after release', () => {
  expect(enterLogin()).toBe(true);
  expect(enterLogin()).toBe(true);
  expect(enterLogin()).toBe(false);
  leaveLogin();
  expect(enterLogin()).toBe(true);
  leaveLogin();
  leaveLogin();
});
test('unknown and malformed stored hashes perform exactly one dummy comparison and never authenticate', async () => {
  const compare = jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  try {
    for (const hash of [undefined, '', 'not-a-hash']) {
      expect(await verifyLoginPassword('hmv-public-dummy-login-proof', hash)).toBe(false);
    }
    expect(compare).toHaveBeenCalledTimes(3);
    for (const call of compare.mock.calls) expect(call[1]).toBe(LOGIN_DUMMY_HASH);
  } finally {
    compare.mockRestore();
  }
});
test('valid hashes perform one real comparison with the existing exact 72-byte prefix', async () => {
  const compare = jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
  try {
    const password = 'a'.repeat(71) + 'é' + 'a'.repeat(10000);
    await verifyLoginPassword(password, LOGIN_DUMMY_HASH);
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0][0]).toEqual(Buffer.from(password).subarray(0, 72));
    expect(compare.mock.calls[0][1]).toBe(LOGIN_DUMMY_HASH);
  } finally {
    compare.mockRestore();
  }
});
