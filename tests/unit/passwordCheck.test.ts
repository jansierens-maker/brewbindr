import { describe, it, expect } from 'vitest';
import { sha1Hex, countInRange, pwnedCount } from '../../services/passwordCheck';

describe('password breach check', () => {
  it('hashes like Pwned Passwords (upper-case SHA-1)', async () => {
    expect(await sha1Hex('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  it('finds the count of a suffix in a range response', () => {
    const body = '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n011053FD0102E94D6AE2F8B83D76FAF94F6:0';
    expect(countInRange(body, '1E4C9B93F3F0682250B6CF8331B7EE68FD8')).toBe(9545824);
    expect(countInRange(body, 'FFFFF')).toBe(0);
  });

  it('only sends the first 5 characters of the hash', async () => {
    let url = '';
    const fake = (async (u: string) => { url = u; return new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3'); }) as unknown as typeof fetch;
    expect(await pwnedCount('password', fake)).toBe(3);
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
  });

  it('does not block when the service is unreachable', async () => {
    const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await pwnedCount('password', failing)).toBeNull();
    const notOk = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await pwnedCount('password', notOk)).toBeNull();
  });
});

import { newPasswordProblem } from '../../services/passwordCheck';

describe('newPasswordProblem', () => {
  it('needs 12 characters, twice the same, and something new', () => {
    expect(newPasswordProblem('kort', 'kort')).toBe('short');
    expect(newPasswordProblem('lang-genoeg-123', 'lang-genoeg-124')).toBe('mismatch');
    expect(newPasswordProblem('lang-genoeg-123', 'lang-genoeg-123', 'lang-genoeg-123')).toBe('same');
    expect(newPasswordProblem('lang-genoeg-123', 'lang-genoeg-123', 'oud-wachtwoord-1')).toBeNull();
    expect(newPasswordProblem('lang-genoeg-123', 'lang-genoeg-123')).toBeNull();
  });
});
