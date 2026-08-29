/**
 * What the platform console does to the database.
 *
 * Every query here is cross-tenant on purpose, which is why they all live in
 * one file that reaches for `PlatformDb` explicitly rather than being spread
 * through the console's pages. If a query in this codebase crosses schools,
 * it should be in here, and it should be obvious from reading it why.
 *
 * Deliberately absent: anything that reads a mark, a marksheet or a report
 * card. Running the platform means knowing how many students a school has,
 * not what any one of them scored.
 */

import type { RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import { PlatformDb } from '../db/tenant';
import {
  DEFAULT_CA_BEST_OF,
  DEFAULT_CA_WEIGHT,
  DEFAULT_EOT_WEIGHT,
  DEFAULT_GRADING_SCALE,
  adminPasswordProblem,
  passwordChangeProblem,
  slugProblem,
  statusChange,
  type SchoolStatus,
} from '../domain/platform';

export class PlatformError extends Error {}

// ---------------------------------------------------------------------
// Reading the estate
// ---------------------------------------------------------------------

export interface SchoolSummary extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  district: string | null;
  status: SchoolStatus;
  suspended_reason: string | null;
  fee_per_student: number | null;
  created_at: Date;
  studentCount: number;
  staffCount: number;
  familyCount: number;
  lastStaffLogin: Date | null;
}

/**
 * Every school, with the numbers that answer "is this one actually being
 * used" — which is the question that matters commercially, and is not the
 * same as whether it exists.
 */
export async function listSchools(db: PlatformDb): Promise<SchoolSummary[]> {
  return db.query<SchoolSummary>(
    `SELECT s.id, s.slug, s.name, s.district, s.status, s.suspended_reason,
            s.fee_per_student, s.created_at,
            (SELECT COUNT(*) FROM students st
              WHERE st.school_id = s.id AND st.status = 'active')      AS studentCount,
            (SELECT COUNT(*) FROM users u
              WHERE u.school_id = s.id AND u.is_active = 1
                AND u.role IN ('school_admin','dos','dos_staff'))      AS staffCount,
            (SELECT COUNT(*) FROM users u
              WHERE u.school_id = s.id AND u.is_active = 1
                AND u.role = 'student_parent')                          AS familyCount,
            (SELECT MAX(u.last_login_at) FROM users u
              WHERE u.school_id = s.id
                AND u.role IN ('school_admin','dos','dos_staff'))      AS lastStaffLogin
       FROM schools s
      ORDER BY s.created_at DESC`,
  );
}

export interface SchoolDetail extends SchoolSummary {
  short_name: string | null;
  motto: string | null;
}

export async function getSchool(db: PlatformDb, id: number): Promise<SchoolDetail | null> {
  const rows = await db.query<SchoolDetail>(
    `SELECT s.id, s.slug, s.name, s.short_name, s.motto, s.district, s.status,
            s.suspended_reason, s.fee_per_student, s.created_at,
            (SELECT COUNT(*) FROM students st
              WHERE st.school_id = s.id AND st.status = 'active')      AS studentCount,
            (SELECT COUNT(*) FROM users u
              WHERE u.school_id = s.id AND u.is_active = 1
                AND u.role IN ('school_admin','dos','dos_staff'))      AS staffCount,
            (SELECT COUNT(*) FROM users u
              WHERE u.school_id = s.id AND u.is_active = 1
                AND u.role = 'student_parent')                          AS familyCount,
            (SELECT MAX(u.last_login_at) FROM users u
              WHERE u.school_id = s.id
                AND u.role IN ('school_admin','dos','dos_staff'))      AS lastStaffLogin
       FROM schools s
      WHERE s.id = ?
      LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface StaffRow extends RowDataPacket {
  id: number;
  display_name: string;
  email: string | null;
  role: string;
  is_active: number;
  last_login_at: Date | null;
}

/**
 * The school's staff accounts — who can get in, not what they did.
 *
 * No password hashes leave the database, and there is no reset here: an
 * administrator who has lost their password is a conversation, not a button
 * that silently takes over a live account.
 */
export async function listStaff(db: PlatformDb, schoolId: number): Promise<StaffRow[]> {
  return db.query<StaffRow>(
    `SELECT id, display_name, email, role, is_active, last_login_at
       FROM users
      WHERE school_id = ? AND role IN ('school_admin','dos','dos_staff')
      ORDER BY FIELD(role,'school_admin','dos','dos_staff'), display_name`,
    [schoolId],
  );
}

// ---------------------------------------------------------------------
// Creating a school
// ---------------------------------------------------------------------

export interface NewSchool {
  slug: string;
  name: string;
  shortName?: string;
  district?: string;
  motto?: string;
  feePerStudent?: number | null;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Creates a school, its defaults and its first administrator, in one
 * transaction.
 *
 * This is what scripts/bootstrap-school.js does from a shell, moved into the
 * console so that onboarding a school no longer requires Midway to have SSH
 * access to the server. The script stays for the very first school on a
 * fresh deployment, when there is no console session to act from.
 */
export async function createSchool(db: PlatformDb, input: NewSchool): Promise<number> {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const email = input.adminEmail.trim().toLowerCase();

  const badSlug = slugProblem(slug);
  if (badSlug) throw new PlatformError(badSlug);
  if (!name) throw new PlatformError('The school needs a name.');
  if (!email.includes('@')) throw new PlatformError('Enter the administrator’s email address.');

  const badPassword = adminPasswordProblem(input.adminPassword);
  if (badPassword) throw new PlatformError(badPassword);

  // Checked before the transaction for a readable message; the unique keys
  // in the schema are what actually guarantee it under a race.
  const clashes = await db.query<RowDataPacket>(
    'SELECT slug FROM schools WHERE slug = ? LIMIT 1',
    [slug],
  );
  if (clashes.length) throw new PlatformError(`A school with the slug "${slug}" already exists.`);

  const takenEmail = await db.query<RowDataPacket>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  if (takenEmail.length) {
    // users.email is unique across the whole platform, not per school.
    throw new PlatformError(`${email} already has an account on another school.`);
  }

  const passwordHash = await bcrypt.hash(input.adminPassword, 10);

  return db.transaction(async (tx) => {
    const school = await tx.execute(
      `INSERT INTO schools (slug, name, short_name, district, motto, fee_per_student, status)
       VALUES (?, ?, ?, ?, ?, ?, 'trial')`,
      [
        slug,
        name,
        input.shortName?.trim() || name.split(' ')[0],
        input.district?.trim() || null,
        input.motto?.trim() || null,
        input.feePerStudent ?? null,
      ],
    );
    const schoolId = school.insertId;

    // Without these a school looks fine and fails at the first marksheet.
    await tx.execute(
      `INSERT INTO school_grading_config (school_id, ca_weight, eot_weight, ca_best_of)
       VALUES (?, ?, ?, ?)`,
      [schoolId, DEFAULT_CA_WEIGHT, DEFAULT_EOT_WEIGHT, DEFAULT_CA_BEST_OF],
    );

    for (const [index, [grade, minScore, label]] of DEFAULT_GRADING_SCALE.entries()) {
      await tx.execute(
        `INSERT INTO grading_scale (school_id, grade, min_score, label, points, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [schoolId, grade, minScore, label, index + 1, index],
      );
    }

    await tx.execute(
      `INSERT INTO users (school_id, role, display_name, email, password_hash)
       VALUES (?, 'school_admin', ?, ?, ?)`,
      [schoolId, input.adminName.trim() || 'Head Teacher', email, passwordHash],
    );

    return schoolId;
  });
}

// ---------------------------------------------------------------------
// Changing a school
// ---------------------------------------------------------------------

/**
 * Starts, suspends or closes a school.
 *
 * Suspension is not cosmetic: `authenticate` refuses a login for any school
 * that is not trial or active, so this turns off the portal and the family
 * app for that tenant at once.
 */
export async function setSchoolStatus(
  db: PlatformDb,
  schoolId: number,
  to: SchoolStatus,
  reason: string,
  actor: { id: number; email: string },
): Promise<void> {
  const school = await getSchool(db, schoolId);
  if (!school) throw new PlatformError('No such school.');

  const verdict = statusChange(school.status, to, reason);
  if (!verdict.ok) throw new PlatformError(verdict.reason);

  await db.execute('UPDATE schools SET status = ?, suspended_reason = ? WHERE id = ?', [
    to,
    to === 'suspended' || to === 'closed' ? reason.trim() : null,
    schoolId,
  ]);

  await recordPlatformAction(db, actor, 'school.status', schoolId, {
    from: school.status,
    to,
    reason: reason.trim() || null,
  });
}

/** What Midway charges this school, per active student per term, in UGX. */
export async function setSchoolFee(
  db: PlatformDb,
  schoolId: number,
  fee: number | null,
  actor: { id: number; email: string },
): Promise<void> {
  if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
    throw new PlatformError('Enter a fee of zero or more, or leave it blank.');
  }

  const changed = await db.execute('UPDATE schools SET fee_per_student = ? WHERE id = ?', [
    fee,
    schoolId,
  ]);
  if (!changed.affectedRows) throw new PlatformError('No such school.');

  await recordPlatformAction(db, actor, 'school.fee', schoolId, { fee });
}

// ---------------------------------------------------------------------
// The trail
// ---------------------------------------------------------------------

/**
 * Platform actions are written with `school_id` set to the school acted on
 * and `user_id` left NULL — the actor is a platform user, and that table is
 * not the one `users` ids come from. Putting a platform id in `user_id`
 * would make it collide with a school user's.
 *
 * audit_log.school_id is nullable precisely so platform-level entries have
 * somewhere to live.
 */
async function recordPlatformAction(
  db: PlatformDb,
  actor: { id: number; email: string },
  action: string,
  schoolId: number | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.execute(
    `INSERT INTO audit_log (school_id, user_id, action, entity, entity_id, detail)
     VALUES (?, NULL, ?, 'school', ?, ?)`,
    [
      schoolId,
      action,
      schoolId,
      JSON.stringify({ ...detail, byPlatformUser: actor.id, byEmail: actor.email }),
    ],
  );
}

export interface PlatformEvent extends RowDataPacket {
  id: number;
  action: string;
  entity_id: number | null;
  detail: string | null;
  created_at: Date;
  schoolName: string | null;
}

/** The console's own recent history, newest first. */
export async function recentPlatformActivity(
  db: PlatformDb,
  limit = 20,
): Promise<PlatformEvent[]> {
  return db.query<PlatformEvent>(
    `SELECT a.id, a.action, a.entity_id, a.detail, a.created_at, s.name AS schoolName
       FROM audit_log a
       LEFT JOIN schools s ON s.id = a.school_id
      WHERE a.user_id IS NULL AND a.action LIKE 'school.%'
      ORDER BY a.created_at DESC
      LIMIT ?`,
    [limit],
  );
}

// ---------------------------------------------------------------------
// Midway's own staff
// ---------------------------------------------------------------------

export interface PlatformAdminRow extends RowDataPacket {
  id: number;
  display_name: string;
  email: string;
  is_active: number;
  last_login_at: Date | null;
  created_at: Date;
}

export async function listPlatformAdmins(db: PlatformDb): Promise<PlatformAdminRow[]> {
  return db.query<PlatformAdminRow>(
    `SELECT id, display_name, email, is_active, last_login_at, created_at
       FROM platform_users
      ORDER BY created_at`,
  );
}

export async function addPlatformAdmin(
  db: PlatformDb,
  input: { name: string; email: string; password: string },
): Promise<number> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new PlatformError('Enter an email address.');

  const problem = adminPasswordProblem(input.password);
  if (problem) throw new PlatformError(problem);

  const existing = await db.query<RowDataPacket>(
    'SELECT id FROM platform_users WHERE email = ? LIMIT 1',
    [email],
  );
  if (existing.length) throw new PlatformError(`${email} is already a platform administrator.`);

  const result = await db.execute(
    `INSERT INTO platform_users (display_name, email, password_hash)
     VALUES (?, ?, ?)`,
    [input.name.trim() || email, email, await bcrypt.hash(input.password, 10)],
  );
  return result.insertId;
}

interface PasswordRow extends RowDataPacket {
  password_hash: string;
}

/**
 * Changes your own password.
 *
 * The one credential operation this console has, and it is a change rather
 * than a reset: the current password must be given, so a session left open
 * on an unlocked machine is not enough to lock its owner out of the platform.
 * Nobody, at any level, can set anybody else's password here.
 *
 * Stamping `password_changed_at` is what makes it mean something. Sessions
 * are signed tokens with no server-side record, so the old password's
 * sessions would otherwise keep working for their full four hours — and the
 * usual reason for changing a password is that someone else has it.
 */
export async function changeOwnPassword(
  db: PlatformDb,
  userId: number,
  current: string,
  next: string,
  confirmation: string,
): Promise<void> {
  const problem = passwordChangeProblem(current, next, confirmation);
  if (problem) throw new PlatformError(problem);

  const rows = await db.query<PasswordRow>(
    'SELECT password_hash FROM platform_users WHERE id = ? AND is_active = 1 LIMIT 1',
    [userId],
  );
  const account = rows[0];
  if (!account) throw new PlatformError('That account is no longer active.');

  if (!(await bcrypt.compare(current, account.password_hash))) {
    throw new PlatformError('That is not your current password.');
  }

  await db.execute(
    'UPDATE platform_users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?',
    [await bcrypt.hash(next, 10), userId],
  );
}

/**
 * Turns another platform administrator's access off or on.
 *
 * Refuses to act on the signed-in account: locking yourself out of the
 * console with no other active administrator would need a shell on the
 * server to undo, which is the situation this console exists to avoid.
 */
export async function setPlatformAdminActive(
  db: PlatformDb,
  targetId: number,
  active: boolean,
  actorId: number,
): Promise<void> {
  if (targetId === actorId) {
    throw new PlatformError('You cannot deactivate the account you are signed in with.');
  }

  if (!active) {
    const others = await db.query<RowDataPacket>(
      'SELECT COUNT(*) AS n FROM platform_users WHERE is_active = 1 AND id <> ?',
      [targetId],
    );
    if (Number(others[0]?.n ?? 0) === 0) {
      throw new PlatformError('That is the last active platform administrator.');
    }
  }

  await db.execute('UPDATE platform_users SET is_active = ? WHERE id = ?', [
    active ? 1 : 0,
    targetId,
  ]);
}
