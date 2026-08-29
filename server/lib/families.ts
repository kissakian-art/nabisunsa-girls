/**
 * Family accounts: how a parent gets into the app at all.
 *
 * A school with nine hundred students cannot type nine hundred logins, and
 * cannot distribute nine hundred passwords: most parents here do not use
 * email, and SMS costs money per message — the thing the platform promises
 * schools they will stop paying.
 *
 * So the school prints slips. It issues a code per student, prints them, and
 * hands them out the way it already hands out report cards. The parent types
 * the registration number and the code once and chooses their own password.
 *
 * The rules about codes live in `domain/invites.ts` and are tested there.
 * This file is the database half: issuing for a whole class, and redeeming
 * one safely.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2';
import type { TenantDb } from '../db/tenant';
import { getPool } from '../db/tenant';
import { normalisePhone } from './auth';
import {
  expiryFrom,
  generateCode,
  inviteRefusal,
  normaliseCode,
  passwordProblem,
  refusalMessage,
  type InviteRefusal,
} from '../domain/invites';

export class FamilyError extends Error {}

const randomIndex = (max: number) => crypto.randomInt(max);

// ---------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------

export interface IssuedSlip {
  studentId: number;
  registrationNo: string;
  studentName: string;
  className: string;
  streamName: string | null;
  parentName: string | null;
  /** Plain text — this is the only moment it exists in readable form. */
  code: string;
  expiresAt: Date;
}

export interface IssueOutcome {
  slips: IssuedSlip[];
  /** Students skipped because a family already signed in for them. */
  alreadyActive: number;
  /** Students skipped because a live code was already issued. */
  alreadyIssued: number;
}

interface StudentRow extends RowDataPacket {
  id: number;
  registrationNo: string;
  firstName: string;
  lastName: string;
  className: string;
  streamName: string | null;
  parentName: string | null;
  userId: number | null;
  liveInvites: number;
}

/**
 * Issues codes for a class.
 *
 * `reissue` decides what happens to students who already have a live code:
 * without it they are skipped, with it their old code is revoked and a new
 * one printed. That is the difference between "print the slips for S4" and
 * "reprint for the twelve who lost theirs", and getting it wrong would
 * invalidate slips already in parents' hands.
 *
 * A student whose family has already activated is never reissued here — that
 * is a password reset, which is `resetFamilyPassword`.
 */
export async function issueInvites(
  db: TenantDb,
  options: {
    classId: number;
    streamId?: number | null;
    studentIds?: number[];
    reissue?: boolean;
    issuedBy: number;
  },
): Promise<IssueOutcome> {
  const filters: string[] = ['s.school_id = :schoolId', "s.status = 'active'", 's.class_id = ?'];
  const params: unknown[] = [options.classId];

  if (options.streamId != null) {
    filters.push('s.stream_id = ?');
    params.push(options.streamId);
  }
  if (options.studentIds?.length) {
    filters.push(`s.id IN (${options.studentIds.map(() => '?').join(',')})`);
    params.push(...options.studentIds);
  }

  const students = await db.raw<StudentRow>(
    `SELECT s.id,
            s.registration_no AS registrationNo,
            s.first_name AS firstName,
            s.last_name  AS lastName,
            c.name       AS className,
            st.name      AS streamName,
            s.parent_name AS parentName,
            s.user_id     AS userId,
            (SELECT COUNT(*) FROM student_invites i
              WHERE i.student_id = s.id
                AND i.status = 'unused'
                AND i.expires_at > NOW()) AS liveInvites
       FROM students s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN streams st ON st.id = s.stream_id
      WHERE ${filters.join(' AND ')}
      ORDER BY s.first_name, s.last_name`,
    params,
  );

  const outcome: IssueOutcome = { slips: [], alreadyActive: 0, alreadyIssued: 0 };
  const issuedAt = new Date();
  const expiresAt = expiryFrom(issuedAt);

  for (const student of students) {
    if (student.userId) {
      outcome.alreadyActive += 1;
      continue;
    }
    if (Number(student.liveInvites) > 0 && !options.reissue) {
      outcome.alreadyIssued += 1;
      continue;
    }

    // One live code per student. Reprinting must retire the old slip, or a
    // code someone found in a drawer would still work.
    await db.raw(
      `UPDATE student_invites SET status = 'revoked'
        WHERE school_id = :schoolId AND student_id = ? AND status = 'unused'`,
      [student.id],
    );

    const code = generateCode(randomIndex);
    await db.insert('student_invites', {
      student_id: student.id,
      code_hash: await bcrypt.hash(code, 10),
      status: 'unused',
      issued_by: options.issuedBy,
      expires_at: expiresAt,
    });

    outcome.slips.push({
      studentId: student.id,
      registrationNo: student.registrationNo,
      studentName: `${student.firstName} ${student.lastName}`,
      className: student.className,
      streamName: student.streamName,
      parentName: student.parentName,
      code,
      expiresAt,
    });
  }

  return outcome;
}

// ---------------------------------------------------------------------
// Redeeming
// ---------------------------------------------------------------------

export interface RedeemInput {
  schoolSlug: string;
  registrationNo: string;
  code: string;
  password: string;
  /** Optional: what the parent wants to be called, and their phone. */
  displayName?: string;
  phone?: string;
  /**
   * An existing family account to attach this child to, rather than making a
   * new one. Set from a signed-in session, never from the request body — a
   * caller must not be able to graft another family's child onto themselves.
   */
  attachToUserId?: number;
}

export interface RedeemResult {
  userId: number;
  schoolId: number;
  studentId: number;
  displayName: string;
}

interface LookupRow extends RowDataPacket {
  schoolId: number;
  studentId: number;
  firstName: string;
  lastName: string;
  parentName: string | null;
  parentPhone: string | null;
  studentUserId: number | null;
  inviteId: number | null;
  codeHash: string | null;
  status: 'unused' | 'used' | 'revoked' | null;
  expiresAt: Date | null;
}

/**
 * Turns a printed slip into an account.
 *
 * Every refusal returns the same shape, and `refusalMessage` decides what the
 * parent reads — deliberately without saying whether the registration number
 * exists. Anyone can download the app, and "no such student" would let a
 * stranger check whether a particular child attends the school.
 *
 * This runs outside the tenant handle because there is no session yet: the
 * school comes from the app's own build (its slug), and everything is scoped
 * to that school explicitly.
 */
export async function redeemInvite(
  input: RedeemInput,
): Promise<{ ok: true; result: RedeemResult } | { ok: false; reason: InviteRefusal; message: string }> {
  const pool = getPool();
  const code = normaliseCode(input.code);
  const registrationNo = input.registrationNo.trim();

  const refuse = (reason: InviteRefusal) =>
    ({ ok: false as const, reason, message: refusalMessage(reason) });

  if (!code || !registrationNo) return refuse('wrong-code');

  const [rows] = await pool.query<LookupRow[]>(
    `SELECT sc.id       AS schoolId,
            s.id        AS studentId,
            s.first_name AS firstName,
            s.last_name  AS lastName,
            s.parent_name  AS parentName,
            s.parent_phone AS parentPhone,
            s.user_id   AS studentUserId,
            i.id        AS inviteId,
            i.code_hash AS codeHash,
            i.status    AS status,
            i.expires_at AS expiresAt
       FROM schools sc
       JOIN students s ON s.school_id = sc.id AND s.registration_no = ?
       -- The most recent invite whatever its state: a parent whose code has
       -- already been used needs to hear that, not "does not match", because
       -- what they actually need is a password reset.
       LEFT JOIN student_invites i ON i.student_id = s.id
      WHERE sc.slug = ?
        AND sc.status IN ('trial','active')
        AND s.status = 'active'
      ORDER BY i.issued_at DESC
      LIMIT 1`,
    [registrationNo, input.schoolSlug],
  );

  const row = rows[0];
  if (!row) return refuse('no-such-student');

  const refusal = inviteRefusal(
    row.inviteId
      ? {
          status: row.status as 'unused' | 'used' | 'revoked',
          expiresAt: new Date(row.expiresAt as Date),
        }
      : null,
  );
  if (refusal) return refuse(refusal);

  // The code is checked last and always with a hash comparison, so a wrong
  // code costs the same time as a right one.
  if (!(await bcrypt.compare(code, row.codeHash as string))) return refuse('wrong-code');

  // A student already attached to an account cannot be claimed again, even
  // with a valid code — that would hand a second household her marks.
  if (row.studentUserId && row.studentUserId !== input.attachToUserId) {
    return refuse('already-used');
  }

  const problem = passwordProblem(input.password);
  if (problem) throw new FamilyError(problem);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Claim the invite first, and only if it is still unused. Two taps of a
    // slow "Activate" button would otherwise create two accounts for one
    // child; here the second finds nothing to claim.
    const [claim] = await connection.query<import('mysql2').ResultSetHeader>(
      `UPDATE student_invites SET status = 'used', used_at = NOW()
        WHERE id = ? AND status = 'unused'`,
      [row.inviteId],
    );
    if (claim.affectedRows !== 1) {
      await connection.rollback();
      return refuse('already-used');
    }

    let userId = input.attachToUserId ?? 0;
    const displayName =
      input.displayName?.trim() ||
      row.parentName ||
      `Parent of ${row.firstName} ${row.lastName}`;

    if (userId) {
      // Attaching a sibling: the account must belong to this school, or a
      // signed-in parent could pull a child across a tenant boundary.
      const [owner] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'student_parent'",
        [userId, row.schoolId],
      );
      if (!owner[0]) {
        await connection.rollback();
        return refuse('wrong-code');
      }
    } else {
      const [created] = await connection.query<import('mysql2').ResultSetHeader>(
        `INSERT INTO users (school_id, role, display_name, phone, password_hash)
         VALUES (?, 'student_parent', ?, ?, ?)`,
        [
          row.schoolId,
          displayName,
          // Stored in the same shape sign-in normalises to, or the number
          // the parent just typed would not find this account tomorrow.
          normalisePhone(input.phone || row.parentPhone || '') || null,
          await bcrypt.hash(input.password, 10),
        ],
      );
      userId = created.insertId;
    }

    await connection.query(
      'UPDATE student_invites SET used_by = ? WHERE id = ?',
      [userId, row.inviteId],
    );
    await connection.query(
      'UPDATE students SET user_id = ? WHERE id = ? AND school_id = ?',
      [userId, row.studentId, row.schoolId],
    );

    await connection.commit();
    return {
      ok: true,
      result: {
        userId,
        schoolId: row.schoolId,
        studentId: row.studentId,
        displayName,
      },
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------
// What the office sees
// ---------------------------------------------------------------------

export interface FamilyStatusRow extends RowDataPacket {
  classId: number;
  className: string;
  streamId: number | null;
  streamName: string | null;
  students: number;
  active: number;
  invited: number;
}

/** Per class: how many families are signed up, and how many are waiting. */
export async function familyStatus(db: TenantDb): Promise<FamilyStatusRow[]> {
  return db.raw<FamilyStatusRow>(
    `SELECT c.id AS classId, c.name AS className,
            st.id AS streamId, st.name AS streamName,
            COUNT(*) AS students,
            SUM(s.user_id IS NOT NULL) AS active,
            SUM(s.user_id IS NULL AND EXISTS (
                  SELECT 1 FROM student_invites i
                   WHERE i.student_id = s.id
                     AND i.status = 'unused'
                     AND i.expires_at > NOW())) AS invited
       FROM students s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN streams st ON st.id = s.stream_id
      WHERE s.school_id = :schoolId AND s.status = 'active'
      GROUP BY c.id, st.id
      ORDER BY c.sort_order, st.name`,
  );
}

/**
 * A password reset, which is a new slip rather than a new password.
 *
 * The office must never be able to read or set a family's password: staff
 * who can set a parent's password can sign in as that parent. Detaching the
 * account and issuing a fresh code keeps the school in control of access
 * without giving it access.
 */
export async function resetFamilyAccess(
  db: TenantDb,
  studentId: number,
  issuedBy: number,
): Promise<IssuedSlip | null> {
  const student = await db.selectOne<RowDataPacket & { class_id: number }>('students', {
    where: { id: studentId },
  });
  if (!student) throw new FamilyError('No such student');

  await db.update('students', { user_id: null }, { id: studentId });

  const outcome = await issueInvites(db, {
    classId: student.class_id,
    studentIds: [studentId],
    reissue: true,
    issuedBy,
  });
  return outcome.slips[0] ?? null;
}
