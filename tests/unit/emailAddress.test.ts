import { describe, expect, it } from 'vitest';
import { isValidEmail } from '../../services/emailAddress';

describe('e-mail address for invitations', () => {
  it('accepts ordinary addresses', () => {
    for (const e of ['jan.sierens@gmail.com', 'jan.sierens+test@gmail.com', 'j.ansierens@gmail.com', 'brewbindrtest@sierens.com', ' jderybel@telenet.be ', "o'brien@example.co.uk"]) {
      expect(isValidEmail(e), e).toBe(true);
    }
  });
  it('refuses what the mail service refuses', () => {
    for (const e of ['jan...sierens@gmail.com', 'jan..sierens@gmail.com', '.jan@gmail.com', 'jan.@gmail.com', 'jan@gmail', 'jan@@gmail.com', 'jan sierens@gmail.com', '@gmail.com', 'jan@-gmail.com', 'jan@gmail.c']) {
      expect(isValidEmail(e), e).toBe(false);
    }
  });
});
