/**
 * The app's address for links in e-mails. Taken from the system variables Vercel sets
 * (not from the request, which a caller controls): in production the project's production
 * domain (a custom domain once one is added, now brewbindr.vercel.app), in a preview that
 * preview's address (it uses the staging database, like the invitation).
 */
export const PRODUCTION_SITE_URL = 'https://brewbindr.vercel.app';

export const siteUrl = (env: Record<string, string | undefined> = process.env): string => {
  const host = env.VERCEL_ENV === 'production'
    ? env.VERCEL_PROJECT_PRODUCTION_URL
    : env.VERCEL_ENV === 'preview' ? (env.VERCEL_BRANCH_URL || env.VERCEL_URL) : undefined;
  return host ? `https://${host}` : PRODUCTION_SITE_URL;
};
