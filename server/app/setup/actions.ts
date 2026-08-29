'use server';

import { revalidatePath } from 'next/cache';
import type { RowDataPacket } from 'mysql2';
import { requireSession } from '../../lib/auth';
import {
  addClass, addStream, adoptCatalogSubjects, generateMarksheets,
  importStudents, parseStudentList, SetupError,
} from '../../lib/setup';
import { issueInvites, resetFamilyAccess, type IssuedSlip } from '../../lib/families';
import { currentTerm } from '../../lib/marksheets';

/** Setup is administration: office staff enter marks, they do not configure. */
function requireAdmin() {
  const context = requireSession();
  if (context.session.role !== 'school_admin' && context.session.role !== 'dos') {
    throw new SetupError('Only the Director of Studies or an administrator can change setup');
  }
  return context;
}

const fail = (error: unknown) => ({
  error: error instanceof Error ? error.message : 'Something went wrong',
});

export async function addClassAction(_prev: unknown, formData: FormData) {
  try {
    const { db } = requireAdmin();
    await addClass(db, {
      code: String(formData.get('code') ?? ''),
      name: String(formData.get('name') ?? ''),
      level: String(formData.get('level')) === 'A-Level' ? 'A-Level' : 'O-Level',
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/setup/classes');
  return { ok: 'Class added.' };
}

export async function addStreamAction(_prev: unknown, formData: FormData) {
  try {
    const { db } = requireAdmin();
    await addStream(db, Number(formData.get('classId')), String(formData.get('name') ?? ''));
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/setup/classes');
  return { ok: 'Stream added.' };
}

export async function adoptSubjectsAction(_prev: unknown, formData: FormData) {
  let added = 0;
  try {
    const { db } = requireAdmin();
    const ids = formData.getAll('catalogId').map(Number).filter(Number.isInteger);
    added = await adoptCatalogSubjects(db, ids);
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/setup/subjects');
  return { ok: added === 0 ? 'Nothing new to add.' : `Added ${added} subject(s).` };
}

export async function importStudentsAction(_prev: unknown, formData: FormData) {
  const text = String(formData.get('list') ?? '');
  const classId = Number(formData.get('classId'));
  const streamRaw = String(formData.get('streamId') ?? '');
  const streamId = streamRaw === '' ? null : Number(streamRaw);

  const parsed = parseStudentList(text);
  if (parsed.students.length === 0) {
    return {
      error: 'Nothing to import.',
      parseErrors: parsed.errors,
    };
  }

  try {
    const { db } = requireAdmin();
    const outcome = await importStudents(db, classId, streamId, parsed.students);
    revalidatePath('/setup/students');
    revalidatePath('/setup');
    return {
      ok: `Added ${outcome.added} student(s).`
        + (outcome.skipped.length ? ` ${outcome.skipped.length} already on the roll.` : ''),
      parseErrors: parsed.errors,
    };
  } catch (error) {
    return { ...fail(error), parseErrors: parsed.errors };
  }
}

export async function generateMarksheetsAction(_prev: unknown, _formData: FormData) {
  try {
    const { db } = requireAdmin();
    const term = await currentTerm(db);
    if (!term) return { error: 'There is no term to generate marksheets for.' };

    const outcome = await generateMarksheets(db, term.id);
    revalidatePath('/setup/marksheets');
    revalidatePath('/');
    return {
      ok: outcome.created === 0
        ? `Nothing to create — all ${outcome.existing} marksheets already exist.`
        : `Created ${outcome.created} marksheet(s).`
          + (outcome.existing ? ` ${outcome.existing} already existed.` : ''),
    };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------
// Family accounts
// ---------------------------------------------------------------------

interface StudentIdRow extends RowDataPacket { id: number }

/**
 * What the family screens get back. The slips are part of the result because
 * the codes exist in readable form only in the moment they are created.
 */
export interface FamilyActionResult {
  ok?: string;
  error?: string;
  slips?: IssuedSlip[];
}

/**
 * Issues codes for a class and hands them back to be printed.
 *
 * The codes travel back in the action's result because this is the only
 * moment they exist in readable form — they are stored hashed, so a slip
 * that is not printed now cannot be recovered, only reissued. The screen
 * says so before the office presses the button.
 */
export async function issueInvitesAction(
  _prev: unknown,
  formData: FormData,
): Promise<FamilyActionResult> {
  try {
    const { db, session } = requireAdmin();
    const streamRaw = String(formData.get('streamId') ?? '');
    const outcome = await issueInvites(db, {
      classId: Number(formData.get('classId')),
      streamId: streamRaw === '' ? null : Number(streamRaw),
      reissue: formData.get('reissue') === 'on',
      issuedBy: session.userId,
    });

    revalidatePath('/setup/families');

    const parts = [`${outcome.slips.length} code(s) to print.`];
    if (outcome.alreadyActive > 0) {
      parts.push(`${outcome.alreadyActive} family account(s) already active — left alone.`);
    }
    if (outcome.alreadyIssued > 0) {
      parts.push(
        `${outcome.alreadyIssued} student(s) already have a live code — tick "reprint" to replace it.`,
      );
    }
    return { ok: parts.join(' '), slips: outcome.slips };
  } catch (error) {
    return fail(error);
  }
}

/**
 * A forgotten password, handled as a new slip.
 *
 * The office cannot set a family's password — staff who can do that can sign
 * in as that parent and read her child's marks. Detaching the account and
 * printing a fresh code keeps the school in control of access without giving
 * it access.
 */
export async function resetFamilyAction(
  _prev: unknown,
  formData: FormData,
): Promise<FamilyActionResult> {
  try {
    const { db, session } = requireAdmin();
    const registrationNo = String(formData.get('registrationNo') ?? '').trim();
    if (!registrationNo) return { error: 'Enter the student’s registration number.' };

    const student = await db.selectOne<StudentIdRow>('students', {
      where: { registration_no: registrationNo },
    });
    if (!student) return { error: `No student with registration number ${registrationNo}.` };

    const slip = await resetFamilyAccess(db, Number(student.id), session.userId);
    revalidatePath('/setup/families');
    return {
      ok: 'Previous access withdrawn. Print the new slip below.',
      slips: slip ? [slip] : ([] as IssuedSlip[]),
    };
  } catch (error) {
    return fail(error);
  }
}
