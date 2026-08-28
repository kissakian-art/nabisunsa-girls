'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  authenticate,
  clearSessionCookie,
  requireSession,
  setSessionCookie,
} from '../lib/auth';
import { saveMarks, transition } from '../lib/marksheets';
import type { MarksheetAction } from '../domain/marksheet';

export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter your email and password.' };
  }

  const session = await authenticate(email, password);
  if (!session) {
    // One message for every failure: distinguishing "no such user" from
    // "wrong password" would let anyone enumerate a school's staff.
    return { error: 'Those details were not recognised.' };
  }

  setSessionCookie(session);
  redirect('/');
}

export async function signOut() {
  clearSessionCookie();
  redirect('/login');
}

export async function saveMarksAction(_prev: unknown, formData: FormData) {
  const { db } = requireSession();
  const marksheetId = Number(formData.get('marksheetId'));

  // Iterate the hidden roster rather than the score inputs. A disabled input
  // is not submitted at all, so a student marked absent would otherwise drop
  // out of the payload entirely and never be recorded.
  const marks: { studentId: number; score: number | null; isAbsent: boolean }[] = [];
  for (const value of formData.getAll('student')) {
    const studentId = Number(value);
    if (!Number.isInteger(studentId)) continue;
    const isAbsent = formData.get(`absent_${studentId}`) === 'on';
    const raw = String(formData.get(`score_${studentId}`) ?? '').trim();
    marks.push({
      studentId,
      score: isAbsent || raw === '' ? null : Number(raw),
      isAbsent,
    });
  }

  try {
    await saveMarks(db, marksheetId, marks);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save marks.' };
  }

  revalidatePath(`/marksheets/${marksheetId}`);
  return { ok: 'Marks saved.' };
}

export async function transitionAction(_prev: unknown, formData: FormData) {
  const { session, db } = requireSession();
  const marksheetId = Number(formData.get('marksheetId'));
  const action = String(formData.get('action')) as MarksheetAction;

  const result = await transition(db, marksheetId, action, {
    id: session.userId,
    role: session.role,
  });

  if (!result.ok) return { error: result.reason };

  revalidatePath(`/marksheets/${marksheetId}`);
  revalidatePath('/');
  return { ok: `Marksheet ${action === 'enter' ? 'submitted for checking' : action + 'ed'}.` };
}
