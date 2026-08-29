import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession, canRelease } from '../../lib/auth';
import { TenantDb } from '../../db/tenant';
import { checkReadiness } from '../../lib/setup';
import { TopBar } from '../topbar';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket { name: string }

export default async function SetupPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const readiness = await checkReadiness(db);

  const steps = [
    { href: '/setup/classes',  label: 'Classes and streams', count: readiness.classes,
      hint: 'The classes the school teaches, and their streams' },
    { href: '/setup/subjects', label: 'Subjects', count: readiness.subjects,
      hint: 'Chosen from the national curriculum list' },
    { href: '/setup/students', label: 'Students', count: readiness.students,
      hint: 'Paste a class list straight from a spreadsheet' },
    { href: '/setup/marksheets', label: 'Marksheets', count: null,
      hint: 'Create this term’s marksheets in one go' },
    { href: '/setup/families', label: 'Family accounts', count: null,
      hint: 'Print the slips parents use to sign into the app' },
  ];

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/">← Marksheets</Link></p>
        <h1>Setup</h1>
        <p className="sub">
          {canRelease(session.role)
            ? 'What the school needs in place before marks can be entered.'
            : 'Setup is changed by the Director of Studies or an administrator.'}
        </p>

        <div className="card">
          <h2>{readiness.ready ? 'Ready for marks' : 'Still to do'}</h2>
          {readiness.ready ? (
            <p className="sub" style={{ margin: 0 }}>
              Everything needed is in place. Marks can be entered and released.
            </p>
          ) : (
            <ul className="sub" style={{ margin: 0, paddingLeft: 20 }}>
              {readiness.missing.map((item) => (
                <li key={item} style={{ fontSize: 15 }}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2>Sections</h2>
          <table>
            <tbody>
              {steps.map((step) => (
                <tr key={step.href}>
                  <td style={{ width: 220 }}>
                    <Link href={step.href}><strong>{step.label}</strong></Link>
                    <div className="reg">{step.hint}</div>
                  </td>
                  <td style={{ width: 90 }}>
                    {step.count == null ? '' : `${step.count}`}
                  </td>
                  <td><Link href={step.href}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
