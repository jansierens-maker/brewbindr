/** Minimum password length for new accounts; must match the Supabase Auth setting. */
export const MIN_PASSWORD_LENGTH = 12;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Upper-case SHA-1 of the password, as Pwned Passwords uses it. */
export const sha1Hex = async (text: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)));

/** How often a hash suffix occurs in a Pwned Passwords range response ("SUFFIX:COUNT" lines). */
export const countInRange = (body: string, suffix: string): number => {
  for (const line of body.split('\n')) {
    const [s, count] = line.trim().split(':');
    if (s?.toUpperCase() === suffix) return Number(count) || 0;
  }
  return 0;
};

/**
 * How often this password appears in known data breaches (Have I Been Pwned).
 * k-anonymity: only the first 5 characters of its SHA-1 hash leave the browser;
 * the check runs locally against the returned list. Returns null when the service
 * cannot be reached, so sign-up is not blocked by an outage.
 */
export const pwnedCount = async (password: string, fetchFn: typeof fetch = fetch): Promise<number | null> => {
  try {
    const hash = await sha1Hex(password);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetchFn(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return countInRange(await res.text(), hash.slice(5));
  } catch {
    return null;
  }
};
