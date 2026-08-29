import {
  CODE_ALPHABET,
  CODE_LENGTH,
  expiryFrom,
  formatCode,
  generateCode,
  inviteRefusal,
  normaliseCode,
  passwordProblem,
  refusalMessage,
} from '../invites';

describe('the printed code', () => {
  it('contains no character that can be misread as another', () => {
    // Both halves of every confusable pair are absent, which is what lets
    // normalisation refuse to guess.
    for (const confusable of ['O', '0', 'I', '1', 'L', 'S', '5', 'B', '8', 'Z', '2']) {
      expect(CODE_ALPHABET).not.toContain(confusable);
    }
  });

  it('never repeats a character in the alphabet', () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });

  it('is generated only from that alphabet', () => {
    let i = 0;
    const code = generateCode(() => i++ % CODE_ALPHABET.length);
    expect(code).toHaveLength(CODE_LENGTH);
    for (const char of code) expect(CODE_ALPHABET).toContain(char);
  });

  it('survives being generated, printed and typed back in', () => {
    const random = (max: number) => Math.floor(Math.random() * max);
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode(random);
      // What the parent sees on the slip, typed back with a space and in the
      // lower case a phone keyboard often produces.
      const typed = formatCode(code).toLowerCase().replace('-', ' ');
      expect(normaliseCode(typed)).toBe(code);
    }
  });

  it('is printed in two groups so it can be read aloud', () => {
    expect(formatCode('ACDEFG')).toBe('ACD-EFG');
  });
});

describe('what a parent typed', () => {
  it('ignores case, spaces and the printed hyphen', () => {
    expect(normaliseCode(' acd-efg ')).toBe('ACDEFG');
    expect(normaliseCode('acd efg')).toBe('ACDEFG');
  });

  it('does not guess at characters outside the alphabet', () => {
    // "0" is not quietly turned into something valid: a wrong code must be
    // refused rather than converted into a different student's.
    expect(normaliseCode('ACD0FG')).toBe('ACD0FG');
  });
});

describe('whether an invite may still be redeemed', () => {
  const future = new Date('2026-12-01T00:00:00Z');
  const now = new Date('2026-09-01T00:00:00Z');

  it('accepts an unused code that has not expired', () => {
    expect(inviteRefusal({ status: 'unused', expiresAt: future }, now)).toBeNull();
  });

  it('refuses a code that was already redeemed', () => {
    expect(inviteRefusal({ status: 'used', expiresAt: future }, now)).toBe('already-used');
  });

  it('refuses a code the school withdrew', () => {
    expect(inviteRefusal({ status: 'revoked', expiresAt: future }, now)).toBe('revoked');
  });

  it('refuses an expired code even though it was never used', () => {
    expect(inviteRefusal({ status: 'unused', expiresAt: now }, now)).toBe('expired');
  });

  it('refuses a student who was never issued one', () => {
    expect(inviteRefusal(null, now)).toBe('no-invite');
  });

  it('expires exactly on the boundary rather than a moment after', () => {
    // A slip that says 90 days must not work on day 91.
    const issued = new Date('2026-09-01T00:00:00Z');
    const expires = expiryFrom(issued, 90);
    expect(inviteRefusal({ status: 'unused', expiresAt: expires }, expires)).toBe('expired');
    expect(
      inviteRefusal({ status: 'unused', expiresAt: expires }, new Date(expires.getTime() - 1)),
    ).toBeNull();
  });
});

describe('what the parent is told', () => {
  it('never reveals whether a registration number exists', () => {
    // Anyone can download the app. If it answered "no such student" a
    // stranger could check whether a particular child attends the school.
    for (const reason of ['no-such-student', 'no-invite', 'revoked', 'wrong-code'] as const) {
      expect(refusalMessage(reason)).toBe(refusalMessage('wrong-code'));
    }
  });

  it('says plainly when a code has already been used', () => {
    // This gives nothing away — they can see the account exists by trying to
    // sign in — and it is the one case with a different next step.
    expect(refusalMessage('already-used')).toMatch(/already been used/i);
    expect(refusalMessage('already-used')).toMatch(/forgotten your password/i);
  });

  it('always ends with what to do next', () => {
    for (const reason of ['no-invite', 'already-used', 'expired', 'wrong-code'] as const) {
      expect(refusalMessage(reason)).toMatch(/school office/i);
    }
  });
});

describe('choosing a password', () => {
  it('asks only for length', () => {
    expect(passwordProblem('kampala2026')).toBeNull();
    // No symbol or digit rule: those produce a password on a sticky note.
    expect(passwordProblem('mydaughter')).toBeNull();
  });

  it('refuses one that is too short', () => {
    expect(passwordProblem('abc')).toMatch(/at least 8/);
  });
});
