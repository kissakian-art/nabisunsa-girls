import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { verifyPlatformSession } from '../../../../lib/platform-auth';
import { PlatformDb } from '../../../../db/tenant';
import { getSchool, listStaff } from '../../../../lib/platform';
import { STATUS_CONSEQUENCE, STATUS_LABEL, canSignIn } from '../../../../domain/platform';
import { PlatformTopBar } from '../../topbar';
import { FeeControl, StatusControl } from './school-controls';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  school_admin: 'Administrator',
  dos: 'Director of Studies',
  dos_staff: 'DoS office',
};

const date = (value: Date | null) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export default async function SchoolPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string };
}) {
  const session = await verifyPlatformSession();
  if (!session) redirect('/platform/login');

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const db = new PlatformDb();
  const school = await getSchool(db, id);
  if (!school) notFound();

  const staff = await listStaff(db, id);

  return (
    <>
      <PlatformTopBar session={session} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}>
          <Link href="/platform">← Schools</Link>
        </p>

        <h1>{school.name}</h1>
        <p className="sub">
          <span className="school-slug">{school.slug}</span>
          {school.district ? ` · ${school.district}` : ''} · added {date(school.created_at)}
        </p>

        {searchParams.created === '1' && (
          <div className="notice ok">
            School created. Give the administrator their password directly, and point them at the
            portal — Setup is where they add classes, subjects and class lists.
          </div>
        )}

        {!canSignIn(school.status) && (
          <div className="notice error">
            <strong>{STATUS_LABEL[school.status]}.</strong> {STATUS_CONSEQUENCE[school.status]}
            {school.suspended_reason ? ` Reason recorded: ${school.suspended_reason}` : ''}
          </div>
        )}

        <div className="card">
          <div className="progress">
            <div className="stat">
              <div className="n">{school.studentCount}</div>
              <div className="l">Active students</div>
            </div>
            <div className="stat">
              <div className="n">{school.staffCount}</div>
              <div className="l">Staff accounts</div>
            </div>
            <div className="stat">
              <div className="n">{school.familyCount}</div>
              <div className="l">Family accounts</div>
            </div>
            <div className="stat">
              <div className="n">
                {school.fee_per_student === null
                  ? '—'
                  : Number(school.fee_per_student).toLocaleString()}
              </div>
              <div className="l">UGX per student</div>
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <h2>Access</h2>
            <StatusControl schoolId={school.id} current={school.status} />
          </div>

          <div className="card">
            <h2>Billing</h2>
            <FeeControl schoolId={school.id} fee={school.fee_per_student} />
            <p className="sub" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              {school.fee_per_student === null || school.studentCount === 0
                ? 'No charge calculated while the fee is blank.'
                : `${(Number(school.fee_per_student) * Number(school.studentCount)).toLocaleString()} UGX per term at today's roll.`}
            </p>
          </div>
        </div>

        <div className="card">
          <h2>Staff accounts</h2>
          {/* Who can get in, not what they did. There is deliberately no
              password reset here: an administrator who has lost theirs is a
              conversation with the school, not a button that silently takes
              over a live account. */}
          {staff.length === 0 ? (
            <p className="report-empty">No staff accounts. Nobody can sign in at this school.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id}>
                    <td>
                      {person.display_name}
                      {!person.is_active && <span className="dim"> · deactivated</span>}
                    </td>
                    <td className="dim">{person.email ?? '—'}</td>
                    <td>{ROLE_LABEL[person.role] ?? person.role}</td>
                    <td className={person.last_login_at ? '' : 'dim'}>
                      {person.last_login_at ? date(person.last_login_at) : 'never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>The branded app</h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            This school&rsquo;s build needs <code>EXPO_PUBLIC_SCHOOL_SLUG={school.slug}</code> and
            an <code>EXPO_PUBLIC_API_BASE_URL</code> pointing at this server. The slug must match
            exactly, or every sign-in from that app is refused.
          </p>
        </div>
      </div>
    </>
  );
}
