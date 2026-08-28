import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { listClasses } from '../../../lib/setup';
import { TopBar } from '../../topbar';
import { StudentImport } from './student-import';

export const dynamic = 'force-dynamic';
interface SchoolRow extends RowDataPacket { name: string }
interface StreamRow extends RowDataPacket { id: number; classId: number; name: string }

export default async function StudentsPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const classes = await listClasses(db);
  const streams = await db.raw<StreamRow>(
    `SELECT id, class_id AS classId, name FROM streams
      WHERE school_id = :schoolId ORDER BY name`,
  );

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/setup">← Setup</Link></p>
        <h1>Students</h1>
        <p className="sub">
          Paste a class list straight from a spreadsheet. Nobody types nine hundred names.
        </p>

        <div className="card">
          <h2>On the roll</h2>
          {classes.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>
              Add a class first — students belong to one.
            </p>
          ) : (
            <table>
              <thead><tr><th>Class</th><th>Streams</th><th>Students</th></tr></thead>
              <tbody>
                {classes.map((cls) => (
                  <tr key={cls.id}>
                    <td><strong>{cls.code}</strong> <span className="reg">{cls.name}</span></td>
                    <td>{cls.streamNames || <span className="reg">none</span>}</td>
                    <td>{cls.studentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {classes.length > 0 && (
          <div className="card">
            <h2>Import a class list</h2>
            <StudentImport
              classes={classes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
              streams={streams.map((s) => ({ id: s.id, classId: s.classId, name: s.name }))}
            />
          </div>
        )}
      </div>
    </>
  );
}
