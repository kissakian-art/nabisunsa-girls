import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { listSubjects, availableCatalogSubjects } from '../../../lib/setup';
import { TopBar } from '../../topbar';
import { SetupForm } from '../setup-form';
import { adoptSubjectsAction } from '../actions';

export const dynamic = 'force-dynamic';
interface SchoolRow extends RowDataPacket { name: string }

export default async function SubjectsPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const subjects = await listSubjects(db);
  const available = await availableCatalogSubjects(db);

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/setup">← Setup</Link></p>
        <h1>Subjects</h1>
        <p className="sub">
          Chosen from the national curriculum list. Adopting a subject copies it to this
          school, so you can rename or retire it without affecting anyone else.
        </p>

        <div className="card">
          <h2>This school teaches ({subjects.length})</h2>
          {subjects.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>No subjects yet.</p>
          ) : (
            <table>
              <thead><tr><th>Code</th><th>Subject</th><th>Level</th><th>Category</th></tr></thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.code}</strong></td>
                    <td>{s.name}</td>
                    <td>{s.level}</td>
                    <td>{s.category ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Add from the national list ({available.length} available)</h2>
          {available.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>
              Every national subject has been adopted.
            </p>
          ) : (
            <SetupForm action={adoptSubjectsAction} label="Add selected subjects">
              <table>
                <thead>
                  <tr><th style={{ width: 40 }} /><th>Subject</th><th>Level</th><th>Category</th></tr>
                </thead>
                <tbody>
                  {available.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="catalogId"
                          value={s.id}
                          id={`cat_${s.id}`}
                          aria-label={s.name}
                        />
                      </td>
                      <td><label htmlFor={`cat_${s.id}`} style={{ display: 'inline', fontWeight: 400 }}>
                        {s.name}
                      </label></td>
                      <td>{s.level}</td>
                      <td>{s.category ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SetupForm>
          )}
        </div>
      </div>
    </>
  );
}
