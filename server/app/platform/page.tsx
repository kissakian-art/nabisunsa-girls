import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPlatformSession } from '../../lib/platform-auth';
import { PlatformDb } from '../../db/tenant';
import { listSchools, recentPlatformActivity } from '../../lib/platform';
import { STATUS_LABEL, canSignIn } from '../../domain/platform';
import { PlatformTopBar } from './topbar';

export const dynamic = 'force-dynamic';

const date = (value: Date | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default async function PlatformConsole() {
  const session = currentPlatformSession();
  if (!session) redirect('/platform/login');

  const db = new PlatformDb();
  const schools = await listSchools(db);
  const activity = await recentPlatformActivity(db, 10);

  const live = schools.filter((s) => canSignIn(s.status));
  const students = schools.reduce((total, s) => total + Number(s.studentCount), 0);
  const families = schools.reduce((total, s) => total + Number(s.familyCount), 0);

  return (
    <>
      <PlatformTopBar session={session} />
      <div className="wrap">
        <h1>Schools</h1>
        <p className="sub">Every school on the platform, and whether it is actually being used.</p>

        <div className="card">
          <div className="progress">
            <div className="stat">
              <div className="n">{schools.length}</div>
              <div className="l">Schools</div>
            </div>
            <div className="stat">
              <div className="n">{live.length}</div>
              <div className="l">Able to sign in</div>
            </div>
            <div className="stat">
              <div className="n">{students}</div>
              <div className="l">Active students</div>
            </div>
            <div className="stat">
              <div className="n">{families}</div>
              <div className="l">Family accounts</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>All schools</h2>
            <Link className="btn" href="/platform/schools/new">Add a school</Link>
          </div>

          {schools.length === 0 ? (
            <p className="report-empty">
              No schools yet. Adding one creates it with the Ugandan defaults and its first
              administrator, who can then work through Setup.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>School</th>
                  <th>Status</th>
                  <th className="num">Students</th>
                  <th className="num">Staff</th>
                  <th className="num">Families</th>
                  <th>Last staff sign-in</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => (
                  <tr key={school.id}>
                    <td>
                      <Link className="school-name" href={`/platform/schools/${school.id}`}>
                        {school.name}
                      </Link>
                      <div className="school-slug">{school.slug}</div>
                    </td>
                    <td>
                      <span className={`badge ${school.status}`}>{STATUS_LABEL[school.status]}</span>
                      {school.suspended_reason && (
                        <div className="why">{school.suspended_reason}</div>
                      )}
                    </td>
                    <td className="num">{school.studentCount}</td>
                    <td className="num">{school.staffCount}</td>
                    <td className="num">{school.familyCount}</td>
                    {/* A school with staff who have never signed in is one that
                        was set up and abandoned — worth seeing at a glance. */}
                    <td className={school.lastStaffLogin ? '' : 'dim'}>
                      {school.lastStaffLogin ? date(school.lastStaffLogin) : 'never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {activity.length > 0 && (
          <div className="card">
            <h2>Recent changes</h2>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>School</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((event) => (
                  <tr key={event.id}>
                    <td className="dim">{date(event.created_at)}</td>
                    <td>{event.schoolName ?? '—'}</td>
                    <td>{describe(event.action, event.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The audit detail is JSON in a TEXT column. It is written by this console
 * and read only here, but a malformed or hand-edited row should show as a
 * dash rather than take the page down.
 */
function describe(action: string, detail: string | null): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = detail ? (JSON.parse(detail) as Record<string, unknown>) : {};
  } catch {
    return action;
  }

  if (action === 'school.status') {
    const to = String(parsed.to ?? '');
    const label = STATUS_LABEL[to as keyof typeof STATUS_LABEL] ?? to;
    const reason = parsed.reason ? ` — ${String(parsed.reason)}` : '';
    return `${label}${reason}`;
  }
  if (action === 'school.fee') {
    return parsed.fee === null ? 'Fee cleared' : `Fee set to ${Number(parsed.fee).toLocaleString()} UGX`;
  }
  return action;
}
