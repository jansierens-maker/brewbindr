/**
 * Whether an e-mail address has a valid form (RFC 5321/5322, unquoted local part), as the
 * mail service requires: no dot at the start or end of the part before @, no two dots in a
 * row ("jan...sierens@gmail.com" is refused even though Gmail ignores dots), a domain with
 * at least one dot. Used for invitations, in the app and in the API.
 */
export const isValidEmail = (raw: string): boolean => {
  const email = raw.trim();
  if (email.length > 254) return false;
  const at = email.lastIndexOf('@');
  if (at <= 0) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64) return false;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (!labels.every(l => /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l))) return false;
  return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]);
};
