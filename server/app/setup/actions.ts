'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '../../lib/auth';
import {
  addClass, addStream, adoptCatalogSubjects, generateMarksheets,
  importStudents, parseStudentList, SetupError,
} from '../../lib/setup';
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
