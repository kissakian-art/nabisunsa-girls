'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { take } from '../../lib/ratelimit';
import {
  authenticatePlatform,
  clearPlatformCookie,
  requirePlatformSession,
  setPlatformCookie,
} from '../../lib/platform-auth';
import {
  addPlatformAdmin,
  createSchool,
  setPlatformAdminActive,
  setSchoolFee,
  setSchoolStatus,
} from '../../lib/platform';
import { SCHOOL_STATUSES, type SchoolStatus } from '../../domain/platform';

/**
 * One shape for everything a console form can come back with, so
 * `useFormState` has a single type to hold rather than a union that widens
 * every time an action gains a branch.
 */
export interface PlatformActionResult {
  ok?: string;
  error?: string;
}

const fail = (error: unknown): PlatformActionResult => ({
  error: error instanceof Error ? error.message : 'Something went wrong',
});

/**
 * A speed bump on the console's front door.
 *
 * Not a wall, and worth being honest about why: the buckets are in memory so
 * they reset with the container, and the forwarded address they key on is
 * client-controlled (see lib/ratelimit.ts). What actually makes guessing
 * expensive is bcrypt at ten rounds — roughly a tenth of a second per
 * attempt, whatever the attacker does with headers.
 *
 * This stops the casual scanning that any public hostname attracts, on a
 * page where one password can suspend every school on the platform. It is
 * deliberately per-caller and not global: a shared ceiling would let anyone
 * lock the real administrator out by failing logins from elsewhere.
 */
const SIGN_IN_LIMIT = { capacity: 10, windowMs: 10 * 60 * 1000 };

export async function platformSignIn(
  _prev: unknown,
  formData: FormData,
): Promise<PlatformActionResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Enter your email and password.' };

  const caller = (headers().get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
  if (!take(`platform-signin:${caller}`, SIGN_IN_LIMIT)) {
    return { error: 'Too many attempts. Wait a few minutes and try again.' };
  }

  const session = await authenticatePlatform(email, password);
  if (!session) {
    // The same message for every failure. This console is on a public
    // hostname, so the sign-in page must not confirm to a stranger that a
    // given address belongs to Midway.
    return { error: 'Those details were not recognised.' };
  }

  setPlatformCookie(session);
  redirect('/platform');
}

export async function platformSignOut() {
  clearPlatformCookie();
  redirect('/platform/login');
}

export async function createSchoolAction(
  _prev: unknown,
  formData: FormData,
): Promise<PlatformActionResult> {
  let schoolId: number;
  try {
    const { db } = requirePlatformSession();
    const fee = String(formData.get('fee') ?? '').trim();
    schoolId = await createSchool(db, {
      slug: String(formData.get('slug') ?? ''),
      name: String(formData.get('name') ?? ''),
      shortName: String(formData.get('shortName') ?? ''),
      district: String(formData.get('district') ?? ''),
      motto: String(formData.get('motto') ?? ''),
      feePerStudent: fee === '' ? null : Number(fee),
      adminName: String(formData.get('adminName') ?? ''),
      adminEmail: String(formData.get('adminEmail') ?? ''),
      adminPassword: String(formData.get('adminPassword') ?? ''),
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/platform');
  redirect(`/platform/schools/${schoolId}?created=1`);
}

export async function setStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<PlatformActionResult> {
  const schoolId = Number(formData.get('schoolId'));
  try {
    const { session, db } = requirePlatformSession();
    const to = String(formData.get('status'));
    if (!(SCHOOL_STATUSES as readonly string[]).includes(to)) {
      return { error: 'Unknown status.' };
    }
    await setSchoolStatus(db, schoolId, to as SchoolStatus, String(formData.get('reason') ?? ''), {
      id: session.platformUserId,
      email: session.email,
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/platform');
  revalidatePath(`/platform/schools/${schoolId}`);
  return { ok: 'Status changed.' };
}

export async function setFeeAction(
  _prev: unknown,
  formData: FormData,
): Promise<PlatformActionResult> {
  const schoolId = Number(formData.get('schoolId'));
  try {
    const { session, db } = requirePlatformSession();
    const raw = String(formData.get('fee') ?? '').trim();
    await setSchoolFee(db, schoolId, raw === '' ? null : Number(raw), {
      id: session.platformUserId,
      email: session.email,
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/platform');
  revalidatePath(`/platform/schools/${schoolId}`);
  return { ok: 'Fee updated.' };
}

export async function addAdminAction(
  _prev: unknown,
  formData: FormData,
): Promise<PlatformActionResult> {
  try {
    const { db } = requirePlatformSession();
    await addPlatformAdmin(db, {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/platform/admins');
  return { ok: 'Administrator added.' };
}

export async function setAdminActiveAction(
  _prev: unknown,
  formData: FormData,
): Promise<PlatformActionResult> {
  try {
    const { session, db } = requirePlatformSession();
    await setPlatformAdminActive(
      db,
      Number(formData.get('adminId')),
      String(formData.get('active')) === '1',
      session.platformUserId,
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/platform/admins');
  return { ok: 'Updated.' };
}
