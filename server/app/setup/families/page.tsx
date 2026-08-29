import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { listClasses } from '../../../lib/setup';
import { familyStatus } from '../../../lib/families';
import { TopBar } from '../../topbar';
import { FamilyCodes } from './family-codes';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket { name: string; slug: string }
interface StreamRow extends RowDataPacket { id: number; classId: number; name: string }

export default async function FamiliesPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>(
    'SELECT name, slug FROM schools WHERE id = :schoolId',
  );
  const classes = await listClasses(db);
  const streams = await db.raw<StreamRow>(
    `SELECT id, class_id AS classId, name FROM streams
      WHERE school_id = :schoolId ORDER BY name`,
  );
  const status = await familyStatus(db);

  const waiting = status.reduce(
    (sum, row) => sum + (Number(row.students) - Number(row.active)),
    0,
  );

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/setup">← Setup</Link></p>
        <h1>Family accounts</h1>
        <p className="sub">
          Parents and students use the app; this is how they get in. The school
          prints a slip for each girl and hands it out — no passwords are sent,
          and nothing costs a message.
        </p>

        <div className="card">
          <h2>Who has signed up</h2>
          {status.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>
              Import the class lists first — codes are issued to students on the roll.
            </p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Class</th><th>Stream</th><th>On the roll</th>
                    <th>Signed up</th><th>Slip issued, not used</th>
                  </tr>
                </thead>
                <tbody>
                  {status.map((row) => (
                    <tr key={`${row.classId}-${row.streamId ?? 0}`}>
                      <td><strong>{row.className}</strong></td>
                      <td>{row.streamName || <span className="reg">whole class</span>}</td>
                      <td>{Number(row.students)}</td>
                      <td>{Number(row.active)}</td>
                      <td>{Number(row.invited)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sub" id="waiting" style={{ marginBottom: 0 }}>
                {waiting === 0
                  ? 'Every family on the roll has an account.'
                  : `${waiting} student(s) have no family account yet.`}
              </p>
            </>
          )}
        </div>

        {classes.length > 0 && (
          <FamilyCodes
            classes={classes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
            streams={streams.map((s) => ({ id: s.id, classId: s.classId, name: s.name }))}
            schoolName={school?.name ?? 'School'}
          />
        )}
      </div>
    </>
  );
}
