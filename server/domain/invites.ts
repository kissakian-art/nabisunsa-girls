/**
 * Invite codes for family accounts.
 *
 * The rules here decide who gets into the app at all, so they are kept
 * separate from the database work and tested on their own.
 *
 * The shape of the problem: a school hands a parent a printed slip. The
 * parent types a registration number and a short code into the app, once.
 * Everything about the code is chosen so that transaction survives being
 * read off paper, in a hurry, possibly by someone who does not use phones
 * much.
 */

/**
 * Deliberately missing: O, 0, I, 1, L, 5, S, 2, Z, 8, B.
 *
 * Every one of those is a pair somebody will confuse when reading a code off
 * a printed slip. Losing them costs a little entropy and saves the school a
 * phone call, which is the better trade — the code is one of two things a
 * parent must have, and it expires.
 */
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY3467';

export const CODE_LENGTH = 6;

/** How long a printed slip stays good for. Roughly one school term. */
export const INVITE_TTL_DAYS = 90;

/** Formats a code the way it is printed: two groups of three. */
export const formatCode = (code: string) =>
  `${code.slice(0, 3)}-${code.slice(3)}`;

/**
 * Normalises what a parent typed.
 *
 * People type the hyphen we printed, or a space instead, or lower case, and
 * some phones capitalise only the first letter. All of that is the same code.
 *
 * Nothing else is guessed at. It is tempting to fold a typed "0" onto "O" or
 * "1" onto "I", but the alphabet above already excludes BOTH halves of every
 * confusable pair — so a character outside it is a genuine misreading, and
 * guessing which one would sometimes turn a correct code into a wrong one.
 * Those are told to check the slip instead.
 */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Generates a code.
 *
 * `random` is injected so tests are deterministic; production passes a
 * cryptographic source. Characters outside the alphabet are never produced,
 * so a generated code always survives `normaliseCode` unchanged.
 */
export function generateCode(random: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  }
  return code;
}

export type InviteStatus = 'unused' | 'used' | 'revoked';

export interface InviteRecord {
  status: InviteStatus;
  expiresAt: Date;
}

export type InviteRefusal =
  | 'no-such-student'
  | 'no-invite'
  | 'already-used'
  | 'revoked'
  | 'expired'
  | 'wrong-code';

/**
 * Whether an invite may still be redeemed, before the code is even checked.
 *
 * Order matters for what the parent is told: "that code has already been
 * used" is a useful thing to hear and gives nothing away — the account
 * exists, which they can see by trying to sign in. "Wrong code" is decided
 * last, by the caller, after the hash comparison.
 */
export function inviteRefusal(
  invite: InviteRecord | null,
  now: Date = new Date(),
): InviteRefusal | null {
  if (!invite) return 'no-invite';
  if (invite.status === 'used') return 'already-used';
  if (invite.status === 'revoked') return 'revoked';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  return null;
}

/**
 * What the parent is shown.
 *
 * Never "no such registration number": that would let anyone with the app
 * test whether a child attends this school. Everything that is not clearly
 * the school's own fault gets the same answer, and it always ends with what
 * to do next — a parent stuck at this screen has no other way forward.
 */
export function refusalMessage(reason: InviteRefusal): string {
  switch (reason) {
    case 'already-used':
      return 'That code has already been used. If you have forgotten your password, ask the school office.';
    case 'expired':
      return 'That code has expired. Ask the school office for a new slip.';
    default:
      return 'That registration number and code do not match. Check the slip from the school, or ask the school office for a new one.';
  }
}

export const MIN_PASSWORD = 8;

/**
 * The one password rule.
 *
 * Length only. Rules about symbols and digits produce "Nabisunsa123!" on a
 * sticky note; a parent choosing something they will remember, of a decent
 * length, is the better outcome. What actually protects the account is that
 * it holds one family's released marks and nothing else.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Please choose a password of at least ${MIN_PASSWORD} characters.`;
  }
  return null;
}

export const expiryFrom = (issued: Date, days: number = INVITE_TTL_DAYS) =>
  new Date(issued.getTime() + days * 24 * 60 * 60 * 1000);
