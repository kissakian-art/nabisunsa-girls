import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { currentTerm } from '../../../lib/marksheets';
import { checkReadiness } from '../../../lib/setup';
import { TopBar } from '../../topbar';
import { SetupForm } from '../setup-form';
import { generateMarksheetsAction } from '../actions';

export const dynamic = 'force-dynamic';
interface SchoolRow extends RowDataPacket { name: string }
interface CountRow extends RowDataPacket { n: number }

export default async function MarksheetSetupPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const term = await currentTerm(db);
  const readiness = await checkReadiness(db);

  const existing = term
    ? Number(
        (await db.raw<CountRow>(
          `SELECT COUNT(*) AS n FROM marksheets
            WHERE school_id = :schoolId AND term_id = ?`, [term.id],
        ))[0]?.n ?? 0,
      )
    : 0;

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/setup">← Setup</Link></p>
        <h1>Marksheets</h1>
        <p className="sub">
          One marksheet per class, stream, subject and assessment. They are generated
          rather than created by hand — a school of six classes and a dozen subjects
          needs hundreds of them.
        </p>

        <div className="card">
          <h2>{term ? term.name : 'No term set up'}</h2>
          {!term ? (
            <p className="sub" style={{ margin: 0 }}>
              Create a term before generating marksheets.
            </p>
          ) : (
            <>
              <p className="sub">
                {existing === 0
                  ? 'No marksheets exist for this term yet.'
                  : `${existing} marksheet(s) already exist for this term.`}
              </p>
              {readiness.missing.length > 0 && (
                <div className="notice info">
                  Some setup is still missing, so generation may produce nothing:
                  <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                    {readiness.missing.map((m) => (
                      <li key={m} style={{ fontSize: 14 }}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <SetupForm action={generateMarksheetsAction} label="Generate marksheets">
                <p className="sub" style={{ fontSize: 14 }}>
                  Existing marksheets are left untouched, so running this again after
                  adding a subject only fills the gaps.
                </p>
              </SetupForm>
            </>
          )}
        </div>
      </div>
    </>
  );
}
