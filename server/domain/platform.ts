/**
 * The rules the platform console enforces, kept away from the database so
 * they can be read and tested on their own.
 *
 * WHAT A PLATFORM ADMINISTRATOR IS
 * --------------------------------
 * Midway's own staff, not a school's. The distinction is structural, not a
 * matter of permissions: `platform_users` is a separate table from `users`,
 * with no school_id at all, so a platform session cannot be handed to
 * `TenantDb` even by mistake — there is no tenant to give it.
 *
 * That is why this is not simply another value in the school `role` enum.
 * Every row in `users` carries `school_id NOT NULL`, and every query in the
 * portal derives its scope from it. A platform administrator has no school,
 * and inventing a NULL or a zero to stand in for "all of them" would put a
 * hole in exactly the boundary the schema exists to defend.
 *
 * WHAT THEY CAN DO
 * ----------------
 * Create schools, and start, suspend or close them. Not read a school's
 * marks: nothing here opens a marksheet or a report card, because commercial
 * administration does not need to see a child's results, and a console that
 * could would be a far worse thing to lose control of.
 */

// ---------------------------------------------------------------------
// School lifecycle
// ---------------------------------------------------------------------

export const SCHOOL_STATUSES = ['trial', 'active', 'suspended', 'closed'] as const;

export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

/**
 * Whether anyone at this school may sign in — staff at the portal or a
 * parent in the app.
 *
 * This is the single fact that makes suspension mean anything. `authenticate`
 * in lib/auth.ts applies the same rule at the point of login, so changing a
 * school's status here genuinely turns the tenant off rather than merely
 * hiding it from a list.
 */
export function canSignIn(status: SchoolStatus): boolean {
  return status === 'trial' || status === 'active';
}

export const STATUS_LABEL: Record<SchoolStatus, string> = {
  trial: 'On trial',
  active: 'Active',
  suspended: 'Suspended',
  closed: 'Closed',
};

/**
 * What each status means for the people at that school, in the words the
 * console shows. Written for the person about to click the button: the
 * question they actually have is "what happens to the school if I do this".
 */
export const STATUS_CONSEQUENCE: Record<SchoolStatus, string> = {
  trial: 'Everyone can sign in. The school has not started paying yet.',
  active: 'Everyone can sign in, and the school is billed.',
  suspended: 'Nobody at the school can sign in — staff or parents. Data is kept.',
  closed: 'Nobody can sign in, and the school is not expected back. Data is kept.',
};

export type StatusRefusal =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether a status change is allowed, and whether it needs a reason.
 *
 * Closing is the one transition treated as final. Nothing in the database
 * stops a closed school being reopened, but requiring it to pass back
 * through 'suspended' means reopening is a deliberate second act rather than
 * an accidental undo of the most serious thing this console can do.
 */
export function statusChange(
  from: SchoolStatus,
  to: SchoolStatus,
  reason: string,
): StatusRefusal {
  if (from === to) {
    return { ok: false, reason: `The school is already ${STATUS_LABEL[to].toLowerCase()}.` };
  }

  // Turning a school off costs its staff and every parent their access, so
  // the record must say who decided and why. A suspension with no reason
  // becomes a mystery within a week.
  if ((to === 'suspended' || to === 'closed') && !reason.trim()) {
    return { ok: false, reason: 'Give a reason — it is shown to nobody but recorded against the school.' };
  }

  if (from === 'closed' && to !== 'suspended') {
    return {
      ok: false,
      reason: 'A closed school is reopened by suspending it first, then making it active or trial.',
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------

/**
 * The slug is not cosmetic: it is compiled into that school's branded app as
 * EXPO_PUBLIC_SCHOOL_SLUG and sent with every sign-in. Changing it later
 * means rebuilding and redistributing an APK to every parent, so the console
 * refuses anything that would embarrass whoever types it.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const MAX_SLUG_LENGTH = 64;

export function suggestSlug(schoolName: string): string {
  return schoolName
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

export function slugProblem(slug: string): string | null {
  if (!slug) return 'A slug is required — the branded app sends it with every sign-in.';
  if (slug.length > MAX_SLUG_LENGTH) return `Keep the slug under ${MAX_SLUG_LENGTH} characters.`;
  if (!SLUG_PATTERN.test(slug)) {
    return 'Use lower-case letters, digits and single hyphens only, for example nabisunsa-girls.';
  }
  return null;
}

// ---------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------

/**
 * Longer than a parent's eight (domain/invites.ts).
 *
 * Not because Midway's staff are more careless, but because of what the two
 * accounts reach. A parent's password protects one family's released marks.
 * A platform password can suspend every school on the platform, and a school
 * administrator's can release marks to every parent at theirs.
 */
export const MIN_ADMIN_PASSWORD = 12;

export function adminPasswordProblem(password: string): string | null {
  if (password.length < MIN_ADMIN_PASSWORD) {
    return `Choose a password of at least ${MIN_ADMIN_PASSWORD} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------
// What a new school starts with
// ---------------------------------------------------------------------

/**
 * A school cannot compute a single mark without a weighting and a grading
 * scale, so creating one without these produces a tenant that looks fine and
 * fails at the first marksheet.
 *
 * These are the Ugandan defaults every school starts from before editing
 * them in Setup. scripts/bootstrap-school.js holds the same values for the
 * pre-console path; if these ever change, that file changes with them.
 */
export const DEFAULT_CA_WEIGHT = 20;
export const DEFAULT_EOT_WEIGHT = 80;
export const DEFAULT_CA_BEST_OF = 3;

export const DEFAULT_GRADING_SCALE: ReadonlyArray<
  readonly [grade: string, minScore: number, label: string]
> = [
  ['A', 80, 'Distinction'],
  ['B', 70, 'Credit'],
  ['C', 60, 'Credit'],
  ['D', 50, 'Pass'],
  ['E', 40, 'Pass'],
  ['O', 30, 'Subsidiary'],
  ['F', 0, 'Failure'],
];
