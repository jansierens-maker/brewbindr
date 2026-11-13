import { describe, expect, it } from 'vitest';
import { siteUrl } from '../../api/_lib/siteUrl';

describe('site address in e-mails', () => {
  it('production: the production domain', () => {
    expect(siteUrl({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'brewbindr.vercel.app', VERCEL_URL: 'brewbindr-abc.vercel.app' })).toBe('https://brewbindr.vercel.app');
  });
  it('preview: the branch address, else the deployment', () => {
    expect(siteUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'brewbindr-git-x.vercel.app', VERCEL_URL: 'brewbindr-abc.vercel.app' })).toBe('https://brewbindr-git-x.vercel.app');
    expect(siteUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'brewbindr-abc.vercel.app' })).toBe('https://brewbindr-abc.vercel.app');
  });
  it('elsewhere: brewbindr.vercel.app, never brewbindr.com', () => {
    expect(siteUrl({})).toBe('https://brewbindr.vercel.app');
  });
});
