import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { listClasses } from '../../../lib/setup';
import { TopBar } from '../../topbar';
import { SetupForm } from '../setup-form';
import { addClassAction, addStreamAction } from '../actions';

export const dynamic = 'force-dynamic';
interface SchoolRow extends RowDataPacket { name: string }

export default async function ClassesPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const classes = await listClasses(db);

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/setup">← Setup</Link></p>
        <h1>Classes and streams</h1>
        <p className="sub">Senior One to Senior Six, and the streams within each.</p>

        <div className="card">
          <h2>Classes ({classes.length})</h2>
          {classes.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>No classes yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Class</th><th>Level</th><th>Streams</th><th>Students</th></tr>
              </thead>
              <tbody>
                {classes.map((cls) => (
                  <tr key={cls.id}>
                    <td><strong>{cls.code}</strong> <span className="reg">{cls.name}</span></td>
                    <td>{cls.level}</td>
                    <td>{cls.streamNames || <span className="reg">none</span>}</td>
                    <td>{cls.studentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Add a class</h2>
          <SetupForm action={addClassAction} label="Add class">
            <div className="field">
              <label htmlFor="code">Code</label>
              <input id="code" name="code" type="text" placeholder="S4" required />
            </div>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" placeholder="Senior Four" />
            </div>
            <div className="field">
              <label htmlFor="level">Level</label>
              <select id="level" name="level" defaultValue="O-Level">
                <option>O-Level</option>
                <option>A-Level</option>
              </select>
            </div>
          </SetupForm>
        </div>

        {classes.length > 0 && (
          <div className="card">
            <h2>Add a stream</h2>
            <p className="sub">
              A school with no streams can skip this — marksheets then cover the whole class.
            </p>
            <SetupForm action={addStreamAction} label="Add stream">
              <div className="field">
                <label htmlFor="classId">Class</label>
                <select id="classId" name="classId">
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.code} — {cls.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="streamName">Stream name</label>
                <input id="streamName" name="name" type="text" placeholder="Red" required />
              </div>
            </SetupForm>
          </div>
        )}
      </div>
    </>
  );
}
